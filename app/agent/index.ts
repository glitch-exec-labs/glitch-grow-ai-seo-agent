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
