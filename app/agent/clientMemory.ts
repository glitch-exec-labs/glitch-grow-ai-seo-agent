/**
 * Client memory — stable, merchant-scoped brand + positioning facts.
 *
 * Distinct from AgentMemory (per-run episodic log). ClientMemory is
 * semantic: it holds the slow-changing truths about the site — brand
 * voice, target audience, differentiators, policies, social links —
 * that every generator needs to stay on-brand.
 *
 * One row per siteId. Auto-seeded from platform APIs on first audit,
 * then merchant-edited via the admin UI.
 */
import prisma from "../db.server";
import type { Connector } from "./types";

export interface ClientMemory {
  siteId: string;
  platform: string;
  brandName?: string | null;
  tagline?: string | null;
  brandVoice?: string | null;
  targetAudience?: string | null;
  differentiators?: string | null;
  categories: string[];
  keyTerms: string[];
  avoidTerms: string[];
  shippingInfo?: string | null;
  returnsInfo?: string | null;
  sameAs: string[];
  notes?: string | null;
  gtmContainerId?: string | null;
}

const EMPTY = {
  categories: [] as string[],
  keyTerms: [] as string[],
  avoidTerms: [] as string[],
  sameAs: [] as string[],
};

export async function loadClientMemory(
  siteId: string,
): Promise<ClientMemory | null> {
  try {
    const row = await prisma.clientMemory.findUnique({ where: { siteId } });
    return row ? toClientMemory(row) : null;
  } catch {
    return null;
  }
}

/**
 * Ensure a ClientMemory row exists for the site. If not, seed it from
 * the connector's shop-level context (shop name, description, logo,
 * primary domain). Never overwrites merchant-provided fields.
 */
export async function ensureClientMemory(
  connector: Connector,
): Promise<ClientMemory> {
  const existing = await loadClientMemory(connector.siteId);
  if (existing) return existing;

  try {
    const ctx = await connector.fetchContext("shop");
    const seed: Record<string, unknown> = {
      siteId: connector.siteId,
      platform: connector.platform,
      brandName: typeof ctx.name === "string" ? ctx.name : null,
      tagline: null,
      brandVoice: null,
      targetAudience: null,
      differentiators: null,
      notes: typeof ctx.description === "string" ? ctx.description : null,
    };
    const row = await prisma.clientMemory.create({ data: seed as never });
    return toClientMemory(row);
  } catch {
    return {
      siteId: connector.siteId,
      platform: connector.platform,
      ...EMPTY,
    };
  }
}

export async function saveClientMemory(
  siteId: string,
  platform: string,
  patch: Partial<ClientMemory>,
): Promise<ClientMemory> {
  const data: Record<string, unknown> = {};
  // Allow explicit null/"" so merchant can clear a field.
  for (const k of [
    "brandName", "tagline", "brandVoice", "targetAudience",
    "differentiators", "shippingInfo", "returnsInfo", "notes",
    "gtmContainerId",
  ] as const) {
    if (k in patch) data[k] = patch[k] ?? null;
  }
  for (const k of ["categories", "keyTerms", "avoidTerms", "sameAs"] as const) {
    if (k in patch && Array.isArray(patch[k])) data[k] = patch[k];
  }
  const row = await prisma.clientMemory.upsert({
    where: { siteId },
    create: { siteId, platform, ...(data as object) },
    update: data as object,
  });
  return toClientMemory(row);
}

/**
 * Short natural-language rendering of the profile — injected into every
 * LLM generator's system prompt so output stays on-brand.
 */
export function renderForPrompt(cm: ClientMemory | null): string {
  if (!cm) return "";
  const lines: string[] = ["<client_memory>"];
  if (cm.brandName) lines.push(`Brand: ${cm.brandName}`);
  if (cm.tagline) lines.push(`Tagline: ${cm.tagline}`);
  if (cm.brandVoice) lines.push(`Voice: ${cm.brandVoice}`);
  if (cm.targetAudience) lines.push(`Audience: ${cm.targetAudience}`);
  if (cm.differentiators) lines.push(`Differentiators:\n${cm.differentiators}`);
  if (cm.categories.length) lines.push(`Categories: ${cm.categories.join(", ")}`);
  if (cm.keyTerms.length) lines.push(`Use these terms: ${cm.keyTerms.join(", ")}`);
  if (cm.avoidTerms.length) lines.push(`NEVER use these terms: ${cm.avoidTerms.join(", ")}`);
  if (cm.shippingInfo) lines.push(`Shipping: ${cm.shippingInfo}`);
  if (cm.returnsInfo) lines.push(`Returns: ${cm.returnsInfo}`);
  if (cm.sameAs.length) lines.push(`Social: ${cm.sameAs.join(", ")}`);
  if (cm.notes) lines.push(`Notes: ${cm.notes}`);
  lines.push("</client_memory>");
  return lines.length > 2 ? lines.join("\n") : "";
}

function toClientMemory(row: {
  siteId: string;
  platform: string;
  brandName: string | null;
  tagline: string | null;
  brandVoice: string | null;
  targetAudience: string | null;
  differentiators: string | null;
  categories: string[];
  keyTerms: string[];
  avoidTerms: string[];
  shippingInfo: string | null;
  returnsInfo: string | null;
  sameAs: string[];
  notes: string | null;
  gtmContainerId?: string | null;
}): ClientMemory {
  return {
    siteId: row.siteId,
    platform: row.platform,
    brandName: row.brandName,
    tagline: row.tagline,
    brandVoice: row.brandVoice,
    targetAudience: row.targetAudience,
    differentiators: row.differentiators,
    categories: row.categories ?? [],
    keyTerms: row.keyTerms ?? [],
    avoidTerms: row.avoidTerms ?? [],
    shippingInfo: row.shippingInfo,
    returnsInfo: row.returnsInfo,
    sameAs: row.sameAs ?? [],
    notes: row.notes,
    gtmContainerId: row.gtmContainerId ?? null,
  };
}
