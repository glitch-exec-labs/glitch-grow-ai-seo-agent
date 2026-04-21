/**
 * Public surface of the agent module.
 *
 *   import { runAudit, previewEdit, applyEdit, shopifyConnector } from "~/agent";
 */
export { runAudit, previewEdit, applyEdit } from "./runner";
export { shopifyConnector } from "./connectors/shopify";
export { htmlConnector } from "./connectors/html";
export { wixConnector } from "./connectors/wix";
export {
  loadClientMemory,
  saveClientMemory,
  ensureClientMemory,
  renderForPrompt as renderClientMemoryForPrompt,
} from "./clientMemory";
export type { ClientMemory } from "./clientMemory";
export { loadProductMemory, saveProductMemory, mergeMemory } from "./productMemory";
export type { ProductMemory } from "./productMemory";
export { listProposals, decideProposal } from "./proposer";
export type { ProposedFact } from "./proposer";
export { llmEnabled, llmMode, llmDisabledReason } from "./llmEnabled";
export type {
  AgentRunResult,
  Connector,
  EditProposal,
  Finding,
  PageEdit,
  PageSample,
  Platform,
  Signal,
  VerifyResult,
} from "./types";
