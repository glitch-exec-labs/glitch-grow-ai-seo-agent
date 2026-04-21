/**
 * llms.txt generator — LLM-generated site manifest, grounded in both
 * platform context and the merchant's ClientMemory (brand, voice,
 * differentiators, policies, social).
 */
import OpenAI from "openai";
import type { ClientMemory } from "../clientMemory";
import { renderForPrompt } from "../clientMemory";
import { llmEnabled } from "../llmEnabled";
import type { EditProposal, PageEdit } from "../types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

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

  try {
    const client = new OpenAI();
    const memory = renderForPrompt(cm);
    const userPayload = `Shop context:\n${JSON.stringify(ctx, null, 2)}${memory ? `\n\n${memory}` : ""}`;
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1000,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPayload },
      ],
    });
    const content = (res.choices[0]?.message?.content ?? fallbackContent).trim();
    return {
      kind: "llmstxt",
      content,
      rationale: proposal.rationale || "llms.txt enables AI answer engines to cite this site.",
    };
  } catch {
    return {
      kind: "llmstxt",
      content: fallbackContent,
      rationale: proposal.rationale || "llms.txt published (fallback; LLM error).",
    };
  }
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
