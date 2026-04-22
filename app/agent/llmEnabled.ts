/**
 * Central LLM kill switch.
 *
 * Every LLM call (planner, FAQ, llmstxt, copy, meta, proposer) gates on
 * llmEnabled(). Defaults to OFF so a fresh production deploy cannot
 * burn credits without an explicit opt-in.
 *
 * To enable: set AGENT_LLM_MODE=live in your environment.
 * Any other value (including unset) disables all LLM calls and every
 * generator falls back to its deterministic path.
 *
 * Also respects OPENAI_API_KEY — if the key is missing, LLM is off
 * regardless of mode (defensive; prevents runtime 401s).
 */
export type LlmMode = "live" | "off";

export function llmMode(): LlmMode {
  const v = (process.env.AGENT_LLM_MODE || "off").toLowerCase();
  return v === "live" ? "live" : "off";
}

export function llmEnabled(): boolean {
  if (llmMode() !== "live") return false;
  // Either provider is acceptable; llmClient.activeProvider() picks.
  return !!process.env.GEMINI_API_KEY || !!process.env.OPENAI_API_KEY;
}

export function llmDisabledReason(): string | null {
  if (llmMode() === "off") return "AGENT_LLM_MODE is not 'live' (default).";
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return "Neither GEMINI_API_KEY nor OPENAI_API_KEY is set.";
  }
  return null;
}
