/**
 * FAQPage JSON-LD — LLM-generated. ClientMemory is injected so Q&A
 * reflects real shipping/returns policy, voice, and audience.
 */
import OpenAI from "openai";
import type { ClientMemory } from "../clientMemory";
import { renderForPrompt } from "../clientMemory";
import { llmEnabled } from "../llmEnabled";
import type { EditProposal, PageEdit } from "../types";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

const SYSTEM = `You write FAQPage JSON-LD for online stores. Return strict JSON.
Shape: {"mainEntity":[{"@type":"Question","name":"...","acceptedAnswer":{"@type":"Answer","text":"..."}},...]}
Rules:
- 5-8 questions. Prefer questions real shoppers ask.
- Answers grounded in shop context AND client_memory (especially shipping/returns).
- Match brand voice from client_memory if provided. Use keyTerms, avoid avoidTerms.
- No marketing puffery. Plain, factual tone.
- Text only, no HTML inside answers.`;

export async function generateFaqSchema(
  proposal: EditProposal,
  ctx: Record<string, unknown>,
  cm: ClientMemory | null,
): Promise<PageEdit> {
  const defaultSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [],
  };

  if (!llmEnabled()) {
    return fallback(proposal, defaultSchema);
  }

  try {
    const client = new OpenAI();
    const memory = renderForPrompt(cm);
    const userPayload = `Shop context:\n${JSON.stringify(ctx, null, 2)}${memory ? `\n\n${memory}` : ""}\n\nReturn the mainEntity array.`;
    const res = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1200,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPayload },
      ],
    });
    const text = res.choices[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    const mainEntity = Array.isArray(parsed.mainEntity) ? parsed.mainEntity : [];
    return {
      kind: "jsonld",
      scope: "shop",
      schema: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity },
      rationale:
        proposal.rationale ||
        "FAQPage schema unlocks rich results and AI-assistant answer citations.",
    };
  } catch {
    return fallback(proposal, defaultSchema);
  }
}

function fallback(
  proposal: EditProposal,
  schema: Record<string, unknown>,
): PageEdit {
  return {
    kind: "jsonld",
    scope: "shop",
    schema,
    rationale: proposal.rationale || "FAQPage schema (empty; LLM unavailable — merchant must fill).",
  };
}
