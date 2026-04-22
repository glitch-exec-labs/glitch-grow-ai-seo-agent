import type { ClientMemory } from "../clientMemory";
import { renderForPrompt } from "../clientMemory";
import { complete } from "../llmClient";
import { llmEnabled } from "../llmEnabled";
import type { EditProposal, PageEdit } from "../types";

const SYSTEM = `You write SEO meta titles and descriptions. Return strict JSON:
{"title":"...", "description":"..."}
Rules:
- title ≤ 60 chars. Brand + differentiator.
- description ≤ 155 chars. One sentence, active voice, who-it's-for + why.
- Match voice from client_memory. Use keyTerms, avoid avoidTerms.
- No emoji, no ALL CAPS, no trailing ellipsis.
- Do NOT fabricate facts.`;

export async function generateMetaDescription(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): Promise<PageEdit> {
  const fallback = {
    kind: "meta" as const,
    scope: proposal.scope === "product" ? ("product" as const) : ("shop" as const),
    productHandle: proposal.productHandle,
    rationale: proposal.rationale || "Meta description (fallback).",
  };

  if (!llmEnabled()) {
    return {
      ...fallback,
      title: cm?.brandName || (typeof ctx.name === "string" ? (ctx.name as string) : ""),
      description: typeof ctx.description === "string" ? (ctx.description as string).slice(0, 155) : "",
    };
  }

  const memory = renderForPrompt(cm);
  const res = await complete({
    system: SYSTEM,
    user: `Context:\n${JSON.stringify(ctx, null, 2)}${memory ? `\n\n${memory}` : ""}`,
    format: "json",
    maxTokens: 300,
    temperature: 0.3,
  });

  if (res.error) {
    return {
      ...fallback,
      description: typeof ctx.description === "string" ? (ctx.description as string).slice(0, 155) : undefined,
    };
  }

  try {
    const parsed = JSON.parse(res.text || "{}");
    return {
      ...fallback,
      title: typeof parsed.title === "string" ? parsed.title.slice(0, 60) : undefined,
      description: typeof parsed.description === "string" ? parsed.description.slice(0, 160) : undefined,
    };
  } catch {
    return {
      ...fallback,
      description: typeof ctx.description === "string" ? (ctx.description as string).slice(0, 155) : undefined,
    };
  }
}
