/**
 * POST /agent/cron/run — scheduled audit entry point.
 *
 * Iterates over all installed Shopify sessions and runs one audit per
 * shop. Gated by TWO independent safety checks so production can never
 * auto-run and burn credits:
 *
 *   1. AGENT_CRON_ENABLED=true     — opt-in flag, default false
 *   2. AGENT_CRON_TOKEN header     — shared secret set in env
 *
 * Additionally respects AGENT_LLM_MODE — when "off" (default), audits
 * still run deterministically but the planner skips (no LLM credits).
 *
 * Typical usage (external cron on your own box):
 *
 *   curl -X POST https://grow.example.com/agent/cron/run \
 *        -H "x-cron-token: $AGENT_CRON_TOKEN"
 *
 * Returns a per-shop summary so the cron caller can log / alert.
 */
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { runAudit, shopifyConnector } from "../agent";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  }
  if (process.env.AGENT_CRON_ENABLED !== "true") {
    return Response.json(
      { error: "cron_disabled", reason: "Set AGENT_CRON_ENABLED=true to opt in." },
      { status: 403 },
    );
  }
  const expected = process.env.AGENT_CRON_TOKEN;
  const provided = request.headers.get("x-cron-token");
  if (!expected || provided !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Discover all installed shops from the Session table. One audit per shop.
  const sessions = await prisma.session.findMany({
    distinct: ["shop"],
    select: { shop: true },
    orderBy: { shop: "asc" },
  });

  const results = [];

  for (const { shop } of sessions) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const connector = shopifyConnector(admin, shop);
      const res = await runAudit(connector);
      results.push({
        shop,
        ok: true,
        passing: res.summary.passing,
        total: res.summary.total,
      });
    } catch (err) {
      results.push({
        shop,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({
    ranAt: new Date().toISOString(),
    shops: results.length,
    llmMode: process.env.AGENT_LLM_MODE || "off",
    results,
  });
};

// GET returns a status readout — useful for manual health checks.
export const loader = () => {
  return Response.json({
    enabled: process.env.AGENT_CRON_ENABLED === "true",
    llmMode: process.env.AGENT_LLM_MODE || "off",
    usage: "POST with header x-cron-token: <AGENT_CRON_TOKEN>",
  });
};
