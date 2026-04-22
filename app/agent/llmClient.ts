/**
 * Provider-agnostic LLM client.
 *
 * Every LLM-calling module in the agent (planner, FAQ / llmstxt /
 * copy / meta generators, ClientMemory proposer) goes through
 * `llmClient()` instead of importing OpenAI or Gemini directly. Picks
 * the active provider at call time so AGENT_LLM_PROVIDER can flip
 * between them without touching any call site.
 *
 * Contract: fail-open with structured errors. Never throws; callers
 * inspect the returned object.
 *
 * Supported providers:
 *   - "gemini"  (default when GEMINI_API_KEY set) — gemini-2.5-flash
 *   - "openai"  (fallback when OPENAI_API_KEY set) — gpt-4o
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { llmEnabled } from "./llmEnabled";

export type LlmProvider = "gemini" | "openai";

export interface LlmRequest {
  /** System / developer prompt. */
  system: string;
  /** User message — instructions + payload (usually stringified JSON). */
  user: string;
  /** Response format. "json" adds provider-specific JSON-mode toggles. */
  format?: "json" | "text";
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResponse {
  /** Raw text body. JSON callers parse this. */
  text: string;
  /** Model that produced the response (for logging). */
  model: string;
  provider: LlmProvider;
  /** Set when the call failed; text is empty in that case. */
  error?: string;
}

/* ─── Provider resolution ────────────────────────────────────────── */

export function activeProvider(): LlmProvider | null {
  if (!llmEnabled()) return null;
  const explicit = (process.env.AGENT_LLM_PROVIDER || "").toLowerCase();
  if (explicit === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (explicit === "openai" && process.env.OPENAI_API_KEY) return "openai";
  // Auto-detect when AGENT_LLM_PROVIDER is unset: Gemini first, then OpenAI.
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

/* ─── Chat / completion ──────────────────────────────────────────── */

export async function complete(req: LlmRequest): Promise<LlmResponse> {
  const provider = activeProvider();
  if (!provider) {
    return { text: "", model: "", provider: "gemini", error: "llm_disabled" };
  }
  try {
    if (provider === "gemini") return await completeGemini(req);
    return await completeOpenAI(req);
  } catch (err) {
    return {
      text: "",
      model: "",
      provider,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function completeGemini(req: LlmRequest): Promise<LlmResponse> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: req.system,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.2,
      ...(req.format === "json" ? { responseMimeType: "application/json" } : {}),
    },
  });
  const res = await model.generateContent(req.user);
  const text = res.response.text() ?? "";
  return { text, model: modelName, provider: "gemini" };
}

async function completeOpenAI(req: LlmRequest): Promise<LlmResponse> {
  const modelName = process.env.OPENAI_MODEL || "gpt-4o";
  const client = new OpenAI();
  const res = await client.chat.completions.create({
    model: modelName,
    max_tokens: req.maxTokens ?? 2048,
    temperature: req.temperature ?? 0.2,
    ...(req.format === "json" ? { response_format: { type: "json_object" } } : {}),
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  });
  const text = res.choices[0]?.message?.content ?? "";
  return { text, model: modelName, provider: "openai" };
}

/* ─── Embeddings ─────────────────────────────────────────────────── */

/**
 * Returns a 1536-dim vector regardless of provider, so the existing
 * pgvector(1536) column works unchanged. Gemini's embedding-001
 * supports `outputDimensionality`; OpenAI's text-embedding-3-small
 * is natively 1536.
 */
export async function embed(text: string): Promise<number[] | null> {
  const provider = activeProvider();
  if (!provider || !text.trim()) return null;
  try {
    if (provider === "gemini") return await embedGemini(text);
    return await embedOpenAI(text);
  } catch {
    return null;
  }
}

async function embedGemini(text: string): Promise<number[] | null> {
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = client.getGenerativeModel({ model: "gemini-embedding-001" });
  const res = await model.embedContent({
    content: { role: "user", parts: [{ text: text.slice(0, 8000) }] },
    // The SDK's type for outputDimensionality lags the HTTP API; cast.
    ...({ outputDimensionality: 1536 } as Record<string, unknown>),
  } as Parameters<typeof model.embedContent>[0]);
  const vec = res.embedding?.values;
  return Array.isArray(vec) && vec.length === 1536 ? vec : null;
}

async function embedOpenAI(text: string): Promise<number[] | null> {
  const client = new OpenAI();
  const res = await client.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
    input: text.slice(0, 8000),
  });
  const vec = res.data[0]?.embedding;
  return Array.isArray(vec) && vec.length === 1536 ? vec : null;
}

export const EMBEDDING_DIM = 1536;
