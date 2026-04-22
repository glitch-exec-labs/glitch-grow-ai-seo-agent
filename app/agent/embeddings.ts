/**
 * Embedding entry point. Delegates to llmClient so the provider
 * picks the right endpoint and returns a 1536-dim vector regardless
 * of backend (matches the pgvector(1536) column).
 */
import { embed as clientEmbed, EMBEDDING_DIM } from "./llmClient";

export async function embed(text: string): Promise<number[] | null> {
  return clientEmbed(text);
}

export { EMBEDDING_DIM };
