import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { decideProposal, listProposals } from "../agent";

/**
 * Review LLM-proposed additions to ClientMemory. Each run (when the
 * LLM kill switch is live) may produce proposals that land here as
 * pending. Merchant approves/rejects per row.
 */

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const proposals = await listProposals(session.shop);
  return { proposals };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const decision = form.get("decision");
  if (!id || (decision !== "approved" && decision !== "rejected")) {
    return { error: "bad input" };
  }
  await decideProposal(session.shop, id, decision);
  return { ok: true };
};

export default function Proposals() {
  const { proposals } = useLoaderData();
  const action = useActionData();
  const pending = proposals.filter((p) => p.status === "pending");
  const settled = proposals.filter((p) => p.status !== "pending");

  return (
    <s-page heading="Proposed brand facts" backAction={{ content: "Client memory", url: "/app/client-memory" }}>
      <s-section heading="How this works">
        <s-paragraph>
          After each audit the agent looks at your storefront content and
          suggests additions to your client memory (voice, keyTerms,
          sameAs, etc). Nothing is added until you approve here.
        </s-paragraph>
        {action?.error && <s-banner tone="critical">{action.error}</s-banner>}
      </s-section>

      <s-section heading={`${pending.length} pending`}>
        {pending.length === 0 ? (
          <s-paragraph>No pending proposals.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {pending.map((p) => (
              <s-stack key={p.id} direction="block" gap="small">
                <s-stack direction="inline" gap="small">
                  <s-badge tone="info">{p.field}</s-badge>
                  <s-text weight="bold">{p.value}</s-text>
                </s-stack>
                {p.evidence && <s-paragraph><em>{p.evidence}</em></s-paragraph>}
                <s-stack direction="inline" gap="small">
                  <Form method="post">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <s-button type="submit" variant="primary">Approve</s-button>
                  </Form>
                  <Form method="post">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <s-button type="submit">Reject</s-button>
                  </Form>
                </s-stack>
              </s-stack>
            ))}
          </s-stack>
        )}
      </s-section>

      {settled.length > 0 && (
        <s-section heading={`${settled.length} decided`}>
          <s-stack direction="block" gap="small">
            {settled.slice(0, 50).map((p) => (
              <s-stack key={p.id} direction="inline" gap="small">
                <s-badge tone={p.status === "approved" ? "success" : "subdued"}>
                  {p.status}
                </s-badge>
                <s-text>{p.field}: {p.value}</s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
