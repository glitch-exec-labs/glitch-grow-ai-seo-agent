/**
 * Product description rewrite — LLM-generated. Provider-agnostic.
 */
import type { ClientMemory } from "../clientMemory";
import { renderForPrompt } from "../clientMemory";
import { complete } from "../llmClient";
import { llmEnabled } from "../llmEnabled";
import type { EditProposal, PageEdit } from "../types";

const SYSTEM = `You rewrite Shopify product descriptions to be citable by AI answer engines while staying on-brand.

Output: HTML fragment (no <html> / <body>). Use <p>, <ul>, <li>, <strong>. No inline styles.

Rules:
- Lead with one factual sentence: what it is, who it's for, differentiator.
- Then a <ul> of 4-7 attribute bullets: material, dimensions, origin, care, compatibility, warranty — only what the source actually states. Do NOT invent facts.
- End with a 1-2 sentence use-case paragraph.
- Match voice + keyTerms from client_memory. Never use avoidTerms.
- 120-220 words.
- Never invent prices, dates, awards.`;

export async function generateCopyRewrite(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): Promise<PageEdit> {
  const handle =
    proposal.productHandle ??
    (typeof ctx.handle === "string" ? (ctx.handle as string) : "");
  if (!handle) throw new Error("generateCopyRewrite: productHandle required");

  if (!llmEnabled()) {
    return {
      kind: "copy",
      productHandle: handle,
      descriptionHtml: typeof ctx.description === "string" ? (ctx.description as string) : "",
      rationale: proposal.rationale || "Copy unchanged (LLM disabled).",
    };
  }

  const memory = renderForPrompt(cm);
  const res = await complete({
    system: SYSTEM,
    user: `Product context:\n${JSON.stringify(ctx, null, 2)}${memory ? `\n\n${memory}` : ""}`,
    format: "text",
    maxTokens: 900,
    temperature: 0.3,
  });

  if (res.error) {
    return {
      kind: "copy",
      productHandle: handle,
      descriptionHtml: typeof ctx.description === "string" ? (ctx.description as string) : "",
      rationale: proposal.rationale || `Copy unchanged (LLM error: ${res.error}).`,
    };
  }

  return {
    kind: "copy",
    productHandle: handle,
    descriptionHtml: (res.text || "").trim(),
    rationale: proposal.rationale || "Rewrite product copy for AI-search citability.",
  };
}
