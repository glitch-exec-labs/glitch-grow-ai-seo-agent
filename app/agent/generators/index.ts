/**
 * Edit generators — hydrate an EditProposal (what the planner wants
 * done) into a concrete PageEdit (what the executor applies).
 *
 * Every generator receives three inputs:
 *   proposal     — planner's intent (kind + scope + rationale)
 *   ctx          — platform-fetched context (shop / product data)
 *   clientMemory — stable brand + positioning facts (see
 *                  app/agent/clientMemory.ts)
 *
 * Deterministic generators read ctx + clientMemory and hand-build the
 * JSON-LD. LLM generators inject clientMemory into their system prompts
 * so output stays on-brand.
 */
import type { ClientMemory } from "../clientMemory";
import { loadProductMemory, mergeMemory } from "../productMemory";
import type { Connector, EditProposal, PageEdit } from "../types";
import { generateOrganizationSchema } from "./organization";
import { generateWebsiteSchema } from "./website";
import { generateProductSchema } from "./product";
import { generateBreadcrumbSchema } from "./breadcrumb";
import { generateFaqSchema } from "./faq";
import { generateLlmsTxt } from "./llmstxt";
import { generateCopyRewrite } from "./copy";
import { generateMetaDescription } from "./meta";

export interface GenerateOpts {
  signalId?: string;
  clientMemory?: ClientMemory | null;
}

export async function generateEdit(
  connector: Connector,
  proposal: EditProposal,
  opts: GenerateOpts = {},
): Promise<PageEdit> {
  const ctx = await connector.fetchContext(proposal.scope, proposal.productHandle);
  let cm = opts.clientMemory ?? null;

  // Per-product overrides merge on top of the site-level profile.
  if (proposal.scope === "product" && proposal.productHandle) {
    const pm = await loadProductMemory(connector.siteId, proposal.productHandle);
    cm = mergeMemory(cm, pm);
  }

  switch (proposal.kind) {
    case "jsonld":
      return routeJsonLd(proposal, ctx, cm, opts.signalId);
    case "meta":
      return generateMetaDescription(proposal, ctx, cm);
    case "llmstxt":
      return generateLlmsTxt(proposal, ctx, cm);
    case "copy":
      return generateCopyRewrite(proposal, ctx, cm);
  }
}

async function routeJsonLd(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
  signalId?: string,
): Promise<PageEdit> {
  const sid = signalId ?? "";
  if (proposal.scope === "shop") {
    if (sid.includes("jsonld.website")) return generateWebsiteSchema(proposal, ctx, cm);
    if (sid.includes("jsonld.faq")) return await generateFaqSchema(proposal, ctx, cm);
    return generateOrganizationSchema(proposal, ctx, cm);
  }
  if (proposal.scope === "product") {
    if (sid.includes("breadcrumb")) return generateBreadcrumbSchema(proposal, ctx, cm);
    return generateProductSchema(proposal, ctx, cm);
  }
  return generateOrganizationSchema(proposal, ctx, cm);
}

export type { ClientMemory };
