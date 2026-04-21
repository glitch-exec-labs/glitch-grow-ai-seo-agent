/**
 * Product description rewrite. ClientMemory enforces brand voice,
 * preferred terminology, and banned terms.
 */
import OpenAI from "openai";
import type { ClientMemory } from "../clientMemory";
import { renderForPrompt } from "../clientMemory";
import { llmEnabled } from "../llmEnabled";
import type { EditProposal, PageEdit } from "../types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

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

  try {
    const client = new OpenAI();
    const memory = renderForPrompt(cm);
    const userPayload = `Product context:\n${JSON.stringify(ctx, null, 2)}${memory ? `\n\n${memory}` : ""}`;
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 900,
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPayload },
      ],
    });
    const html = (res.choices[0]?.message?.content ?? "").trim();
    return {
      kind: "copy",
      productHandle: handle,
      descriptionHtml: html,
      rationale: proposal.rationale || "Rewrite product copy for AI-search citability.",
    };
  } catch (err) {
    return {
      kind: "copy",
      productHandle: handle,
      descriptionHtml: typeof ctx.description === "string" ? (ctx.description as string) : "",
      rationale:
        proposal.rationale ||
        `Copy unchanged (LLM error: ${err instanceof Error ? err.message : "unknown"}).`,
    };
  }
}
