import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const run = await prisma.agentRun.findFirst({
    where: { id: params.runId, siteId: session.shop },
  });
  if (!run) {
    return new Response("Run not found", { status: 404 });
  }
  return { run };
};

export default function RunDetail() {
  const { run } = useLoaderData();
  const signals = Array.isArray(run.signals) ? run.signals : [];
  const findings = Array.isArray(run.findings) ? run.findings : [];
  const groups = signals.reduce((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {});

  return (
    <s-page heading={`Run · ${run.id.slice(0, 8)}`} backAction={{ content: "All runs", url: "/app/runs" }}>
      <s-section heading="Summary">
        <s-stack direction="inline" gap="base">
          <s-badge>{run.summary?.passing ?? 0} passing</s-badge>
          <s-badge tone={run.summary?.failing > 0 ? "critical" : "subdued"}>
            {run.summary?.failing ?? 0} failing
          </s-badge>
          <s-badge tone={run.plannerSkipped ? "subdued" : "info"}>
            {run.plannerSkipped ? "signals-only" : (run.plannerModel ?? "llm")}
          </s-badge>
        </s-stack>
        <s-paragraph>{new Date(run.createdAt).toLocaleString()}</s-paragraph>
        {run.error && <s-banner tone="critical">{run.error}</s-banner>}
      </s-section>

      {findings.length > 0 && (
        <s-section heading="Findings">
          <s-stack direction="block" gap="small">
            {findings.map((f) => (
              <s-stack key={f.id} direction="block" gap="small">
                <s-stack direction="inline" gap="small">
                  <s-badge tone={f.severity === "critical" ? "critical" : f.severity === "warning" ? "attention" : "subdued"}>
                    {f.severity}
                  </s-badge>
                  <s-text weight="bold">{f.title}</s-text>
                </s-stack>
                <s-paragraph>{f.body}</s-paragraph>
                {f.recommendation && (
                  <s-paragraph><s-text weight="bold">Recommendation:</s-text> {f.recommendation}</s-paragraph>
                )}
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}

      {Object.entries(groups).map(([g, items]) => (
        <s-section heading={`Signals · ${g}`} key={g}>
          <s-stack direction="block" gap="small">
            {items.map((a) => (
              <s-stack key={a.id} direction="inline" gap="small">
                <s-text>{a.status === true ? "✅" : a.status === false ? "❌" : "⏳"}</s-text>
                <s-text>{a.label}</s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      ))}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
