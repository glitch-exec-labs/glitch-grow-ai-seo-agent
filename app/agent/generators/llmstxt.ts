/**
 * llms.txt generator — LLM-generated site manifest for AI answer
 * engines. Provider-agnostic.
 */
import type { ClientMemory } from "../clientMemory";
import { renderForPrompt } from "../clientMemory";
import { complete } from "../llmClient";
import { llmEnabled } from "../llmEnabled";
import type { EditProposal, PageEdit } from "../types";

const SYSTEM = `You write llms.txt manifests for online stores. Output markdown only, no fences.
Structure:
  # <Store Name>
  > <one-sentence positioning>

  ## What we sell
  - <category>: <what>
  ...

  ## Key pages
  - [Home](<url>)
  - [All Products](<url>/collections/all)
  - [Shipping & Returns](...)
  ...

  ## Contact
  - Email: <...>
  - Site: <url>

Rules:
- Grounded in shop context AND client_memory. Do not invent URLs, policies, products.
- Use brand voice from client_memory when set.
- ≤ 40 lines. Concrete, no marketing fluff.
- Omit sections that would require invention.`;

export async function generateLlmsTxt(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): Promise<PageEdit> {
  const fallbackContent = buildFallback(ctx, cm);
  if (!llmEnabled()) {
    return {
      kind: "llmstxt",
      content: fallbackContent,
      rationale: proposal.rationale || "llms.txt published (fallback; LLM disabled).",
    };
  }

  const memory = renderForPrompt(cm);
  const userPayload = `Shop context:\n${JSON.stringify(ctx, null, 2)}${memory ? `\n\n${memory}` : ""}`;

  const res = await complete({
    system: SYSTEM,
    user: userPayload,
    format: "text",
    maxTokens: 1000,
    temperature: 0.2,
  });
  if (res.error) {
    return {
      kind: "llmstxt",
      content: fallbackContent,
      rationale: proposal.rationale || "llms.txt published (fallback; LLM error).",
    };
  }

  return {
    kind: "llmstxt",
    content: (res.text || fallbackContent).trim(),
    rationale: proposal.rationale || "llms.txt enables AI answer engines to cite this site.",
  };
}

function buildFallback(
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): string {
  const c = ctx as { name?: string; url?: string; description?: string };
  const lines = [
    `# ${cm?.brandName || c.name || "Store"}`,
    cm?.tagline || (c.description ? `> ${c.description}` : ""),
    "",
    "## Key pages",
    c.url ? `- [Home](${c.url})` : "",
    c.url ? `- [All Products](${c.url}/collections/all)` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
