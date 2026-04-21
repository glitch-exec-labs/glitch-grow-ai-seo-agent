/**
 * ClientMemory proposer — after an audit, ask the LLM to suggest
 * additions to the brand profile based on what it saw on the site.
 *
 * Proposals land in ClientMemory.learnedFacts as a pending array:
 *   [{ id, field, value, evidence, proposedAt }]
 *
 * The merchant approves/rejects in the admin UI; approved facts merge
 * into the main profile fields. Never writes to the profile directly.
 *
 * Respects the central LLM kill switch — no proposals in prod until
 * AGENT_LLM_MODE=live is set.
 */
import OpenAI from "openai";
import prisma from "../db.server";
import type { ClientMemory } from "./clientMemory";
import { llmEnabled } from "./llmEnabled";
import type { Signal } from "./types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const SYSTEM = `You observe an SEO agent's run on an online store and suggest additions to the store's long-term client memory (brand profile).

Input: shop name, storefront URL, a sample of HTML observations, and the current client_memory (may be sparse).

Output strict JSON: {"proposals":[{"field":"...","value":"...","evidence":"..."}]}
- field ∈ {"brandVoice","tagline","targetAudience","differentiators","keyTerms","avoidTerms","categories","sameAs","notes"}
- value is a single string (for list fields, one item per proposal — multiple proposals per field are fine)
- evidence is the short snippet from observations that justifies the proposal
- Cap total proposals at 8. No duplicates of fields already populated.
- Only propose facts that are directly observable. Do not invent.`;

export interface ProposedFact {
  id: string;
  field: string;
  value: string;
  evidence: string;
  proposedAt: string;
  status: "pending" | "approved" | "rejected";
}

export async function proposeFacts(params: {
  siteId: string;
  shopName?: string | null;
  storefrontUrl?: string | null;
  signals: Signal[];
  current: ClientMemory | null;
  homeHtmlSnippet?: string | null;
}): Promise<ProposedFact[]> {
  if (!llmEnabled()) return [];

  try {
    const client = new OpenAI();
    const payload = {
      shop: { name: params.shopName ?? null, url: params.storefrontUrl ?? null },
      current_memory: params.current ?? null,
      signals: params.signals.slice(0, 20).map((s) => ({
        id: s.id,
        status: s.status,
        label: s.label,
        role: s.source.role,
      })),
      observations: (params.homeHtmlSnippet || "").slice(0, 6000),
    };
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(payload, null, 2) },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    const arr = Array.isArray(parsed.proposals) ? parsed.proposals : [];
    const proposals: ProposedFact[] = arr
      .filter((p: unknown) => typeof p === "object" && p !== null)
      .slice(0, 8)
      .map((p: Record<string, unknown>, i: number) => ({
        id: `${Date.now()}-${i}`,
        field: String(p.field ?? ""),
        value: String(p.value ?? "").slice(0, 1000),
        evidence: String(p.evidence ?? "").slice(0, 500),
        proposedAt: new Date().toISOString(),
        status: "pending",
      }))
      .filter((p: ProposedFact) => p.field && p.value);

    if (!proposals.length) return [];
    await persistPending(params.siteId, proposals);
    return proposals;
  } catch {
    return [];
  }
}

async function persistPending(siteId: string, newProposals: ProposedFact[]) {
  // Append to existing pending proposals in ClientMemory.learnedFacts.
  const row = await prisma.clientMemory.findUnique({
    where: { siteId },
    select: { learnedFacts: true },
  });
  const existing = toArray(row?.learnedFacts);
  const merged = dedupe([...existing, ...newProposals]);
  await prisma.clientMemory.update({
    where: { siteId },
    data: { learnedFacts: merged as unknown as object },
  });
}

export async function listProposals(siteId: string): Promise<ProposedFact[]> {
  const row = await prisma.clientMemory.findUnique({
    where: { siteId },
    select: { learnedFacts: true },
  });
  return toArray(row?.learnedFacts);
}

export async function decideProposal(
  siteId: string,
  proposalId: string,
  decision: "approved" | "rejected",
): Promise<void> {
  const row = await prisma.clientMemory.findUnique({
    where: { siteId },
    select: { learnedFacts: true, keyTerms: true, avoidTerms: true, categories: true, sameAs: true },
  });
  if (!row) return;
  const all = toArray(row.learnedFacts);
  const target = all.find((p) => p.id === proposalId);
  if (!target || target.status !== "pending") return;
  target.status = decision;

  const update: Record<string, unknown> = { learnedFacts: all as unknown as object };

  if (decision === "approved") {
    const listFields = new Set(["keyTerms", "avoidTerms", "categories", "sameAs"]);
    if (listFields.has(target.field)) {
      const current = (row as Record<string, unknown>)[target.field] as string[] | null;
      const next = [...(current ?? []), target.value];
      update[target.field] = Array.from(new Set(next));
    } else {
      update[target.field] = target.value;
    }
  }
  await prisma.clientMemory.update({ where: { siteId }, data: update as object });
}

function toArray(v: unknown): ProposedFact[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is ProposedFact =>
      typeof x === "object" && x !== null && "id" in x && "field" in x,
  );
}

function dedupe(list: ProposedFact[]): ProposedFact[] {
  const seen = new Set<string>();
  const out: ProposedFact[] = [];
  for (const p of list) {
    const k = `${p.field}::${p.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
