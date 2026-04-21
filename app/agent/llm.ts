/**
 * LLM planner — synthesizes ranked, executable findings from
 * deterministic signals plus prior memory.
 *
 * Powered by OpenAI `gpt-4o`. Fail-open: if OPENAI_API_KEY is unset or
 * the call errors, the agent returns deterministic fallback findings
 * and logs the reason; a run never breaks because the LLM is unhappy.
 */
import OpenAI from "openai";
import { llmEnabled } from "./llmEnabled";
import type { EditProposal, Finding, Signal } from "./types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const MAX_TOKENS = 2048;

const SYSTEM_PROMPT = `You are the planner node of an autonomous SEO agent that operates across Shopify, plain HTML, and Wix websites.

Input: (a) deterministic SEO signals extracted from the live site, (b) prior context from this site's memory, (c) the platform + siteId.

Output (STRICT JSON, no prose, no markdown fences):
{
  "findings": [
    {
      "id": "kebab-case-stable-id",
      "severity": "critical" | "warning" | "info",
      "title": "short human title",
      "body": "2-3 sentence impact explanation in plain English",
      "evidence": ["signal.id", ...],
      "recommendation": "one concrete next action the executor can take",
      "edit": {
        "kind": "jsonld" | "meta" | "llmstxt" | "copy",
        "scope": "shop" | "product" | "site",
        "productHandle": "optional, required if scope=product",
        "rationale": "why this edit fixes the finding"
      } | null
    }
  ]
}

Rules:
- Cap findings at 8. Merge duplicates.
- Critical = blocks rich results or AI-answer citations (Product, FAQPage, Breadcrumb schema).
- If prior memory shows a finding was already resolved, do NOT resurface unless signals regressed.
- edit.kind must be non-null when the executor can act deterministically; leave null for findings that need merchant judgement.
- id must be stable across runs for the same underlying issue.`;

export type PlannerInput = {
  siteId: string;
  platform: string;
  signals: Signal[];
  priorContext?: string;
};

export type PlannerOutput = {
  findings: Finding[];
  model?: string;
  skipped: boolean;
  error?: string;
};

export async function plan(input: PlannerInput): Promise<PlannerOutput> {
  if (!llmEnabled()) {
    return { findings: fallbackFindings(input.signals), skipped: true };
  }
  const client = new OpenAI();

  const userPayload = {
    siteId: input.siteId,
    platform: input.platform,
    signals: input.signals.map((s) => ({
      id: s.id,
      label: s.label,
      group: s.group,
      status: s.status,
      url: s.source.url,
      role: s.source.role,
    })),
    prior_context: input.priorContext || "",
  };

  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Site signals and prior memory below. Return findings JSON.\n\n${JSON.stringify(
            userPayload,
            null,
            2
          )}`,
        },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "";
    const parsed = safeParseFindings(text);
    return { findings: parsed, model: MODEL, skipped: false };
  } catch (err) {
    return {
      findings: fallbackFindings(input.signals),
      skipped: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function safeParseFindings(raw: string): Finding[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]);
    const arr = Array.isArray(obj.findings) ? obj.findings : [];
    return arr
      .filter((f: unknown) => typeof f === "object" && f !== null)
      .map((f: Record<string, unknown>, i: number) => ({
        id: String(f.id ?? `finding-${i}`),
        severity:
          (f.severity as Finding["severity"]) ?? ("info" as const),
        title: String(f.title ?? "Untitled finding"),
        body: String(f.body ?? ""),
        evidence: Array.isArray(f.evidence)
          ? (f.evidence as unknown[]).map(String)
          : [],
        recommendation:
          typeof f.recommendation === "string" ? f.recommendation : undefined,
        edit: safeParseEdit(f.edit),
      }));
  } catch {
    return [];
  }
}

function safeParseEdit(raw: unknown): EditProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const kind = e.kind;
  if (kind !== "jsonld" && kind !== "meta" && kind !== "llmstxt" && kind !== "copy")
    return null;
  const scope = (e.scope as EditProposal["scope"]) ?? "shop";
  return {
    kind: kind as EditProposal["kind"],
    scope,
    productHandle:
      typeof e.productHandle === "string" ? e.productHandle : undefined,
    rationale: typeof e.rationale === "string" ? e.rationale : "",
  };
}

/** Deterministic findings used when the LLM planner is unavailable. */
function fallbackFindings(signals: Signal[]): Finding[] {
  const failing = signals.filter((s) => s.status === false);
  return failing.slice(0, 8).map((s) => ({
    id: s.id,
    severity: s.group === "structured-data" ? "warning" : "info",
    title: `Missing: ${s.label}`,
    body: `Signal ${s.id} is failing on ${s.source.url}.`,
    evidence: [s.id],
    edit: proposeFallbackEdit(s),
  }));
}

function proposeFallbackEdit(s: Signal): EditProposal | null {
  // Map a failing signal to the edit the executor would apply.
  if (s.id.endsWith("home.jsonld.organization"))
    return { kind: "jsonld", scope: "shop", rationale: "Add Organization schema" };
  if (s.id.endsWith("home.jsonld.website"))
    return { kind: "jsonld", scope: "shop", rationale: "Add WebSite + SearchAction schema" };
  if (s.id.endsWith("home.jsonld.faq"))
    return { kind: "jsonld", scope: "shop", rationale: "Add FAQPage schema" };
  if (s.id.endsWith("product.jsonld.product"))
    return { kind: "jsonld", scope: "product", rationale: "Add Product schema" };
  if (s.id.endsWith("product.jsonld.breadcrumb"))
    return { kind: "jsonld", scope: "product", rationale: "Add BreadcrumbList schema" };
  if (s.id.endsWith("site.llmstxt.linked"))
    return { kind: "llmstxt", scope: "site", rationale: "Publish llms.txt for AI-search citability" };
  if (s.id.endsWith("page.meta.description"))
    return { kind: "meta", scope: "shop", rationale: "Write meta description" };
  return null;
}
