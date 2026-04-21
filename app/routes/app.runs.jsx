import { useLoaderData, Link } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Run history — lists recent AgentRun rows for the current shop.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const runs = await prisma.agentRun.findMany({
    where: { siteId: session.shop },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      summary: true,
      plannerModel: true,
      plannerSkipped: true,
      error: true,
    },
  });
  return { runs };
};

export default function Runs() {
  const { runs } = useLoaderData();
  return (
    <s-page heading="Run history" backAction={{ content: "Back", url: "/app" }}>
      <s-section heading={`${runs.length} recent runs`}>
        {runs.length === 0 ? (
          <s-paragraph>No runs yet. Click <s-text weight="bold">Run AI SEO agent</s-text> on the dashboard to kick off your first audit.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="small">
            {runs.map((r) => {
              const s = r.summary || {};
              return (
                <s-stack key={r.id} direction="inline" gap="base">
                  <s-text>{new Date(r.createdAt).toLocaleString()}</s-text>
                  <s-badge tone={s.passing === s.total ? "success" : "attention"}>
                    {s.passing ?? 0}/{s.total ?? 0} passing
                  </s-badge>
                  <s-badge tone={s.failing > 0 ? "critical" : "subdued"}>
                    {s.failing ?? 0} failing
                  </s-badge>
                  {r.plannerSkipped ? (
                    <s-badge tone="subdued">signals-only</s-badge>
                  ) : (
                    <s-badge tone="info">{r.plannerModel ?? "llm"}</s-badge>
                  )}
                  {r.error && <s-badge tone="critical">error</s-badge>}
                  <Link to={`/app/runs/${r.id}`}>details →</Link>
                </s-stack>
              );
            })}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
