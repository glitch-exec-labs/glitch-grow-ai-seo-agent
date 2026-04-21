import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { runAudit, shopifyConnector } from "../agent";

/**
 * Glitch Grow AI SEO Agent — embedded admin home page.
 *
 * Flow:
 *   1. Loader renders the dashboard with shop context.
 *   2. "Run AI SEO agent" triggers the root action → runAudit() →
 *      renders findings + signals.
 *   3. Each finding with an `edit` proposal renders a "Preview fix"
 *      button that POSTs to /app/agent/preview, displays the hydrated
 *      PageEdit inline, then "Apply" POSTs to /app/agent/apply.
 */

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const shopRes = await admin.graphql(`#graphql
    {
      shop {
        id
        name
        myshopifyDomain
        primaryDomain { url host }
      }
      productsCount { count }
    }`);
  const json = await shopRes.json();
  const shop = json.data.shop;
  return {
    shop,
    storefrontUrl: shop.primaryDomain?.url || `https://${shop.myshopifyDomain}`,
    counts: { products: json.data.productsCount?.count ?? 0 },
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const connector = shopifyConnector(admin, session.shop);
  return await runAudit(connector);
};

export default function Index() {
  const { shop, storefrontUrl, counts } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isAuditing = fetcher.state === "submitting" || fetcher.state === "loading";
  const result = fetcher.data;

  useEffect(() => {
    if (result?.summary) {
      const { passing, total } = result.summary;
      shopify.toast.show(`Audit complete: ${passing}/${total} signals passing`);
    }
  }, [result?.runId, shopify]);

  const runAgent = () => fetcher.submit({}, { method: "POST" });

  const groupedSignals = result?.signals?.reduce((acc, s) => {
    (acc[s.group] = acc[s.group] || []).push(s);
    return acc;
  }, {}) || {};

  return (
    <s-page heading="Glitch Grow AI SEO Agent">
      <s-button slot="primary-action" onClick={runAgent} {...(isAuditing ? { loading: true } : {})}>
        Run AI SEO agent
      </s-button>

      <s-section heading={shop.name}>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text>Store:</s-text>{" "}
            <s-link href={storefrontUrl} target="_blank">{storefrontUrl}</s-link>
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <s-badge>{counts.products} products</s-badge>
            <s-badge tone="info">Shopify connector</s-badge>
          </s-stack>
          <s-paragraph>
            The agent crawls a representative slice of your storefront,
            extracts deterministic SEO signals, consults its memory of
            past runs, and has an LLM planner propose ranked fixes.
            Clicking Preview shows the exact change; Apply writes it to
            your shop metafields (or productUpdate for copy) and
            verifies the live storefront picked it up.
          </s-paragraph>
        </s-stack>
      </s-section>

      {result?.summary && (
        <s-section heading={`Run · ${result.summary.passing}/${result.summary.total} passing`}>
          <s-stack direction="inline" gap="base">
            <s-badge tone={result.summary.passing === result.summary.total ? "success" : "attention"}>
              {result.summary.passing} passing
            </s-badge>
            <s-badge tone={result.summary.failing > 0 ? "critical" : "subdued"}>
              {result.summary.failing} failing
            </s-badge>
            {result.plannerSkipped ? (
              <s-badge tone="subdued">Planner: signals-only</s-badge>
            ) : (
              <s-badge tone="info">Planner: {result.plannerModel}</s-badge>
            )}
          </s-stack>
          <s-paragraph>{new Date(result.ranAt).toLocaleString()}</s-paragraph>
        </s-section>
      )}

      {result?.findings?.length > 0 && (
        <s-section heading="Findings">
          <s-stack direction="block" gap="base">
            {result.findings.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </s-stack>
        </s-section>
      )}

      {Object.entries(groupedSignals).map(([group, items]) => (
        <s-section heading={`Signals · ${group}`} key={group}>
          <s-stack direction="block" gap="small">
            {items.map((a) => (
              <s-stack key={a.id} direction="inline" gap="small">
                <s-text>
                  {a.status === true ? "✅" : a.status === false ? "❌" : "⏳"}
                </s-text>
                <s-text>{a.label}</s-text>
              </s-stack>
            ))}
          </s-stack>
        </s-section>
      ))}

      {!result && (
        <s-section heading="What the agent checks">
          <s-unordered-list>
            <s-list-item>Organization / OnlineStore / WebSite JSON-LD</s-list-item>
            <s-list-item>FAQPage, BreadcrumbList, Product schema coverage</s-list-item>
            <s-list-item>Product JSON-LD <code>additionalProperty</code> + <code>aggregateRating</code></s-list-item>
            <s-list-item>Canonical, og:image protocol, semantic H1, meta description</s-list-item>
            <s-list-item>AI-search readiness (<code>llms.txt</code>, citable copy)</s-list-item>
          </s-unordered-list>
        </s-section>
      )}

      <s-section slot="aside" heading="Client memory">
        <s-paragraph>
          Long-term brand profile the agent reads on every generation.
          Setting voice, differentiators, policies, and social links here
          makes every FAQ, meta description, and copy rewrite stay
          on-brand.
        </s-paragraph>
        <s-link href="/app/client-memory">Edit client memory →</s-link>
      </s-section>

      <s-section slot="aside" heading="First-time setup">
        <s-paragraph>
          The agent writes schema into shop + product metafields under
          the <code>glitch_grow_seo</code> namespace. The
          <s-text weight="bold"> Glitch Grow SEO schema </s-text>
          theme app embed block reads those metafields and injects JSON-LD
          into your storefront head. Enable it once in your theme editor
          (Customize → App embeds).
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

function FindingRow({ finding }) {
  const [preview, setPreview] = useState(null);
  const [applied, setApplied] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toneFor = (s) => (s === "critical" ? "critical" : s === "warning" ? "attention" : "subdued");

  const runPreview = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/app/agent/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: finding.edit,
          signalId: finding.evidence?.[0],
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPreview(json.edit);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/app/agent/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edit: preview, signalId: finding.evidence?.[0] }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setApplied(json);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <s-stack direction="block" gap="small">
      <s-stack direction="inline" gap="small">
        <s-badge tone={toneFor(finding.severity)}>{finding.severity}</s-badge>
        <s-text weight="bold">{finding.title}</s-text>
      </s-stack>
      <s-paragraph>{finding.body}</s-paragraph>
      {finding.recommendation && (
        <s-paragraph>
          <s-text weight="bold">Recommendation:</s-text> {finding.recommendation}
        </s-paragraph>
      )}

      {finding.edit && !preview && !applied && (
        <s-stack direction="inline" gap="small">
          <s-button onClick={runPreview} {...(busy ? { loading: true } : {})}>
            Preview fix
          </s-button>
        </s-stack>
      )}

      {preview && !applied && (
        <s-stack direction="block" gap="small">
          <s-text weight="bold">Preview ({preview.kind})</s-text>
          <PreviewBody edit={preview} />
          <s-stack direction="inline" gap="small">
            <s-button onClick={apply} {...(busy ? { loading: true } : {})}>
              Apply
            </s-button>
            <s-button onClick={() => setPreview(null)} variant="secondary">
              Cancel
            </s-button>
          </s-stack>
        </s-stack>
      )}

      {applied && (
        <s-stack direction="inline" gap="small">
          <s-badge tone={applied.verify?.ok ? "success" : "attention"}>
            {applied.verify?.ok ? "Applied + verified" : "Applied"}
          </s-badge>
          {applied.verify && <s-text>{applied.verify.detail}</s-text>}
        </s-stack>
      )}

      {error && <s-banner tone="critical">{error}</s-banner>}
    </s-stack>
  );
}

function PreviewBody({ edit }) {
  if (edit.kind === "jsonld") {
    return (
      <pre style={{ background: "#f6f6f6", padding: 12, fontSize: 12, overflow: "auto", maxHeight: 400 }}>
        {JSON.stringify(edit.schema, null, 2)}
      </pre>
    );
  }
  if (edit.kind === "meta") {
    return (
      <s-stack direction="block" gap="small">
        {edit.title && <s-text><strong>Title:</strong> {edit.title}</s-text>}
        {edit.description && <s-text><strong>Description:</strong> {edit.description}</s-text>}
      </s-stack>
    );
  }
  if (edit.kind === "llmstxt") {
    return (
      <pre style={{ background: "#f6f6f6", padding: 12, fontSize: 12, whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto" }}>
        {edit.content}
      </pre>
    );
  }
  if (edit.kind === "copy") {
    return (
      <div
        style={{ background: "#f6f6f6", padding: 12, fontSize: 14, maxHeight: 400, overflow: "auto" }}
        dangerouslySetInnerHTML={{ __html: edit.descriptionHtml }}
      />
    );
  }
  return null;
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
