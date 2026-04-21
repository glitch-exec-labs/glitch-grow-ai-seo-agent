import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadProductMemory, saveProductMemory } from "../agent";

/**
 * Per-product override of ClientMemory. Merged on top of the site
 * profile at generation time.
 */

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const handle = params.handle;
  const pm = await loadProductMemory(session.shop, handle);
  return { handle, pm };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const handle = params.handle;
  const form = await request.formData();
  const getString = (k) => {
    const v = form.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const getList = (k) =>
    getString(k).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

  const patch = {
    brandVoice: getString("brandVoice") || null,
    notes: getString("notes") || null,
    keyTerms: getList("keyTerms"),
    avoidTerms: getList("avoidTerms"),
  };

  try {
    const pm = await saveProductMemory(session.shop, handle, patch);
    return { ok: true, pm };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

export default function ProductMemoryEditor() {
  const { handle, pm } = useLoaderData();
  const actionData = useActionData();
  const nav = useNavigation();
  const saving = nav.state === "submitting";
  const current = actionData?.pm ?? pm ?? {
    brandVoice: "",
    keyTerms: [],
    avoidTerms: [],
    notes: "",
  };

  return (
    <s-page
      heading={`Product memory · ${handle}`}
      backAction={{ content: "Client memory", url: "/app/client-memory" }}
    >
      <s-section heading="Why this matters">
        <s-paragraph>
          Per-product overrides merge on top of your shop-wide client
          memory. Useful when one product needs a different tone, or
          carries its own preferred terminology.
        </s-paragraph>
      </s-section>
      <Form method="post">
        <s-section heading="Override">
          <s-stack direction="block" gap="base">
            <s-text-area label="Voice override" name="brandVoice" defaultValue={current.brandVoice ?? ""} />
            <s-text-area label="Additional keyTerms (one per line)" name="keyTerms" defaultValue={(current.keyTerms ?? []).join("\n")} rows={3} />
            <s-text-area label="Additional avoidTerms (one per line)" name="avoidTerms" defaultValue={(current.avoidTerms ?? []).join("\n")} rows={3} />
            <s-text-area label="Notes" name="notes" defaultValue={current.notes ?? ""} rows={4} />
          </s-stack>
        </s-section>
        <s-section>
          <s-stack direction="inline" gap="small">
            <s-button type="submit" variant="primary" {...(saving ? { loading: true } : {})}>Save</s-button>
            {actionData?.ok && <s-badge tone="success">Saved</s-badge>}
            {actionData?.ok === false && <s-badge tone="critical">{actionData.error}</s-badge>}
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
