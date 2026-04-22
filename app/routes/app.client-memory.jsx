import { useState } from "react";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureClientMemory, saveClientMemory, shopifyConnector } from "../agent";

/**
 * Client Memory — merchant-editable brand/positioning profile.
 *
 * Loaded once per site. Every LLM generator injects these facts into
 * its system prompt so output stays on-brand across runs. Seeded from
 * Shopify shop data on first audit; here the merchant refines it.
 */

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const connector = shopifyConnector(admin, session.shop);
  const cm = await ensureClientMemory(connector);
  return { cm };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const getString = (k) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const getList = (k) =>
    getString(k)
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const patch = {
    brandName: getString("brandName") || null,
    tagline: getString("tagline") || null,
    brandVoice: getString("brandVoice") || null,
    targetAudience: getString("targetAudience") || null,
    differentiators: getString("differentiators") || null,
    shippingInfo: getString("shippingInfo") || null,
    returnsInfo: getString("returnsInfo") || null,
    notes: getString("notes") || null,
    gtmContainerId: getString("gtmContainerId") || null,
    categories: getList("categories"),
    keyTerms: getList("keyTerms"),
    avoidTerms: getList("avoidTerms"),
    sameAs: getList("sameAs"),
  };

  try {
    const cm = await saveClientMemory(session.shop, "shopify", patch);
    return { ok: true, cm };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

export default function ClientMemory() {
  const { cm } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const saving = nav.state === "submitting";
  const [pending] = useState(false);

  const current = actionData?.cm ?? cm;

  return (
    <s-page heading="Client memory" backAction={{ content: "Back", url: "/app" }}>
      <s-section heading="Why this matters">
        <s-paragraph>
          Client memory is the long-term brand profile the agent reads on
          every generation. Stronger memory → more on-brand FAQ answers,
          product copy rewrites, meta descriptions, and <code>llms.txt</code>
          output. Seeded from your Shopify shop data; refine it here.
        </s-paragraph>
        <s-paragraph>
          Distinct from <s-text weight="bold">agent memory</s-text>, which
          logs past runs and helps the planner avoid resurfacing fixes
          you've already applied.
        </s-paragraph>
      </s-section>

      <Form method="post">
        <s-section heading="Brand">
          <s-stack direction="block" gap="base">
            <s-text-field label="Brand name" name="brandName" defaultValue={current.brandName ?? ""} />
            <s-text-field label="Tagline / one-sentence positioning" name="tagline" defaultValue={current.tagline ?? ""} />
            <s-text-area label="Voice (e.g. 'warm, technical, occasional humor')" name="brandVoice" defaultValue={current.brandVoice ?? ""} />
            <s-text-area label="Target audience" name="targetAudience" defaultValue={current.targetAudience ?? ""} />
            <s-text-area label="Differentiators (one per line)" name="differentiators" defaultValue={current.differentiators ?? ""} rows={4} />
          </s-stack>
        </s-section>

        <s-section heading="Catalog + tone">
          <s-stack direction="block" gap="base">
            <s-text-area label="Categories (comma or newline separated)" name="categories" defaultValue={(current.categories ?? []).join("\n")} rows={3} />
            <s-text-area label="Use these terms" name="keyTerms" defaultValue={(current.keyTerms ?? []).join("\n")} rows={3} />
            <s-text-area label="NEVER use these terms" name="avoidTerms" defaultValue={(current.avoidTerms ?? []).join("\n")} rows={3} />
          </s-stack>
        </s-section>

        <s-section heading="Policies">
          <s-stack direction="block" gap="base">
            <s-text-area label="Shipping info" name="shippingInfo" defaultValue={current.shippingInfo ?? ""} rows={3} />
            <s-text-area label="Returns info" name="returnsInfo" defaultValue={current.returnsInfo ?? ""} rows={3} />
          </s-stack>
        </s-section>

        <s-section heading="Social & notes">
          <s-stack direction="block" gap="base">
            <s-text-area
              label="Social profile URLs (one per line — used as Organization.sameAs in JSON-LD)"
              name="sameAs"
              defaultValue={(current.sameAs ?? []).join("\n")}
              rows={3}
            />
            <s-text-area label="Notes (free-form brand context)" name="notes" defaultValue={current.notes ?? ""} rows={4} />
          </s-stack>
        </s-section>

        <s-section heading="Analytics & tags">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Paste your Google Tag Manager container id below (format{" "}
              <code>GTM-XXXXXXX</code>). When set, the Glitch Grow SEO
              theme app embed injects the GTM <code>&lt;script&gt;</code> into{" "}
              <code>&lt;head&gt;</code> and the <code>&lt;noscript&gt;</code>{" "}
              <code>&lt;iframe&gt;</code> into <code>&lt;body&gt;</code>. You must
              also enable the two GTM blocks under{" "}
              <s-text weight="bold">Theme Editor → App embeds</s-text>.
            </s-paragraph>
            <s-text-field
              label="GTM container id"
              name="gtmContainerId"
              defaultValue={current.gtmContainerId ?? ""}
              placeholder="GTM-XXXXXXX"
            />
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="inline" gap="small">
            <s-button type="submit" variant="primary" {...(saving || pending ? { loading: true } : {})}>
              Save
            </s-button>
            {actionData?.ok && <s-badge tone="success">Saved</s-badge>}
            {actionData?.ok === false && <s-badge tone="critical">{actionData.error}</s-badge>}
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
