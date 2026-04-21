/**
 * Embedding provider shim. The agent uses embeddings to retrieve prior
 * findings for the same site from agent_memory.
 *
 * Fail-open: if no provider is configured, embed() returns null and the
 * memory layer falls back to FTS-only retrieval.
 */
import OpenAI from "openai";
import { llmEnabled } from "./llmEnabled";

const DIM = 1536; // matches text-embedding-3-small

export async function embed(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  // Embeddings also cost credits, so gate on the central kill switch.
  if (!llmEnabled()) return null;
  try {
    const client = new OpenAI();
    const res = await client.embeddings.create({
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      input: text.slice(0, 8000),
    });
    const vec = res.data[0]?.embedding;
    return Array.isArray(vec) && vec.length === DIM ? vec : null;
  } catch {
    return null;
  }
}

export const EMBEDDING_DIM = DIM;
