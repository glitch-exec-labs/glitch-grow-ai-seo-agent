<h1 align="center">Glitch Grow AI SEO Agent</h1>

<p align="center">
  An autonomous SEO agent for Shopify stores — audits structured data, ships
  schema coverage, and generates content for traditional search and AI answer
  engines.
</p>

<p align="center">
  <a href="https://grow.glitchexecutor.com"><img alt="Live" src="https://img.shields.io/badge/live-grow.glitchexecutor.com-0A84FF"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A520.19-339933?logo=node.js&logoColor=white">
  <img alt="Shopify" src="https://img.shields.io/badge/Shopify%20API-2026--07-96BF48?logo=shopify&logoColor=white">
</p>

---

> Part of **Glitch Grow**, the digital marketing domain inside **Glitch Executor Labs** — one builder shipping products across **Trade**, **Edge**, and **Grow**.

## What it does

An autonomous SEO agent that plugs into **any website** — Shopify today, plain HTML and Wix next — and runs the same audit → plan → execute → verify loop across every platform. One agent brain, pluggable site connectors.

- **Audit.** Deterministic signal extraction across structured data, breadcrumbs, canonical, `og:image`, semantic H1, meta description, and AI-search readiness (`llms.txt`).
- **Plan.** An LLM planner (OpenAI `gpt-4o`) synthesizes the signals plus prior-run memory into a ranked list of findings, each carrying an executable edit proposal.
- **Memory.** Two layers. **Agent memory** — every run is persisted to a pgvector-backed table; hybrid retrieval (vector + recency) feeds the planner prior context so it doesn't resurface already-fixed issues. **Client memory** — a stable per-site brand profile (voice, audience, differentiators, policies, social) that every LLM generator reads to stay on-brand.
- **Execute.** Preview-first writes: the agent generates the exact change (JSON-LD schema, meta tags, `llms.txt`, rewritten product copy), shows it to the merchant, and applies it via shop/product metafields or `productUpdate` only on confirm.
- **Verify.** Re-fetches the live page after the write and confirms the expected signal is now present.

## Architecture

```
┌─────────── Core agent (platform-agnostic) ────────────┐
│  Auditor → Planner → Executor → Verifier              │
│     ↑         ↑          ↓         ↑                  │
│     └── signals & ───────┴── writes & reads ─────┐    │
│         prior memory                             │    │
│                                                  ▼    │
│                          Memory (Postgres + pgvector) │
└───────────────────┬───────────────────────────────────┘
                    │ same capability interface
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  ShopifyConnector  HTMLConnector  WixConnector
    (v0: read)        (stub)         (stub)
```

Every connector implements the same [`Connector`](./app/agent/types.ts) interface: `crawlSample`, `applyEdit`, `verify`. The core agent is identical across platforms — adding a new platform means dropping one file in `app/agent/connectors/`.

### Agent layout

```
app/agent/
  types.ts              Connector interface + Signal / Finding / PageEdit union
  signals.ts            Deterministic HTML signal extractor (regex-only)
  llm.ts                OpenAI gpt-4o planner — fail-open if no API key
  embeddings.ts         OpenAI embedding shim for memory retrieval
  memory.ts             Agent memory — pgvector + recency-decay retrieval
  clientMemory.ts       Client memory — stable per-site brand profile
  productMemory.ts      Per-product override of client memory
  llmEnabled.ts         Central LLM kill switch (AGENT_LLM_MODE)
  proposer.ts           Post-audit LLM step that suggests client-memory additions
  runner.ts             runAudit / previewEdit / applyEdit entry points
  generators/           Hydrate an EditProposal → concrete PageEdit
    organization.ts       Deterministic Organization JSON-LD
    website.ts            Deterministic WebSite + SearchAction JSON-LD
    product.ts            Deterministic Product JSON-LD
    breadcrumb.ts         Deterministic BreadcrumbList JSON-LD
    faq.ts                LLM-generated FAQPage schema
    llmstxt.ts            LLM-generated /llms.txt markdown
    copy.ts               LLM rewrites product description HTML
    meta.ts               LLM-generated meta title + description
  connectors/
    shopify.ts          Admin GraphQL + storefront fetch + metafield writes
    html.ts             Stub — base URL fetch only
    wix.ts              Stub
  index.ts              Public surface
```

### How writes land on Shopify

The agent writes into the `glitch_grow_seo` metafield namespace:

| Metafield | Owner | Content |
|---|---|---|
| `jsonld_organization`, `jsonld_website`, `jsonld_faq` | shop | Full JSON-LD objects |
| `jsonld_product`, `jsonld_breadcrumb` | product | Full JSON-LD objects |
| `meta_title`, `meta_description` | shop / product | Meta tag overrides |
| `llmstxt` | shop | Markdown manifest for AI answer engines |

A **Theme App Embed block** (`extensions/glitch-grow-seo-schema/`) reads these metafields and injects `<script type="application/ld+json">` blocks into the storefront `<head>`. Merchants enable the block once from Theme Editor → Customize → App embeds; after that the agent fully controls the rendered schema by updating metafields.

`/llms.txt` at the storefront is served by a 301 redirect (auto-created by the agent) → `/apps/glitch-grow-seo/llms.txt` → app route that reads the `llmstxt` metafield.

Product copy rewrites go through the standard `productUpdate` Admin mutation.

### Environment

**Cost safety first.** The agent is designed so production deploys never burn LLM credits until you explicitly opt in:

| Var | Default | Purpose |
|---|---|---|
| `AGENT_LLM_MODE` | `off` | **Central LLM kill switch.** Must be `live` for any OpenAI call (planner, generators, embeddings, fact proposer). When `off`, the agent still audits + applies deterministic fixes. |
| `OPENAI_API_KEY` | unset | Single key powers planner, generators, embeddings, proposer. |
| `OPENAI_MODEL` | `gpt-4o` | Planner + generator model. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | 1536-dim, matches the pgvector column. |
| `AGENT_CRON_ENABLED` | `false` | Opt-in for scheduled audits via `POST /agent/cron/run`. |
| `AGENT_CRON_TOKEN` | unset | Shared secret checked against `x-cron-token` header. |

### Scheduled audits

One endpoint, two independent gates:

```
POST /agent/cron/run
  headers: x-cron-token: $AGENT_CRON_TOKEN
```

Iterates over every installed shop in `Session`, runs one audit per shop, returns a per-shop summary. Gated by `AGENT_CRON_ENABLED=true` **and** the header token. If `AGENT_LLM_MODE=off`, audits still run but the planner and LLM generators skip (no credit burn) — useful for daily-snapshot runs in prod while the LLM pathway is reviewed.

Point any external scheduler (system cron, Cloudflare Workers cron, GitHub Actions, etc.) at it.

## Stack

| Layer        | Tech                                                       |
|--------------|------------------------------------------------------------|
| Framework    | [React Router 7](https://reactrouter.com) (SSR, file routes) |
| Shopify      | [`@shopify/shopify-app-react-router`](https://www.npmjs.com/package/@shopify/shopify-app-react-router), App Bridge v4, Polaris v12 |
| Data         | Prisma 6 + PostgreSQL ([`@shopify/shopify-app-session-storage-prisma`](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma)) |
| Extensions   | Theme app extensions (JSON-LD blocks), checkout UI extensions |
| Runtime      | Node ≥ 20.19, pnpm 10                                      |

## Getting started

### Prerequisites

- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) and a Shopify Partner account
- Node ≥ 20.19, pnpm ≥ 10
- PostgreSQL 14+ (local or hosted)

### Install

```bash
pnpm install
cp .env.example .env          # fill in Shopify + DATABASE_URL
pnpm prisma migrate deploy
pnpm dev                      # shopify app dev
```

> **Note:** `shopify.app.toml` pins the production Glitch SEO `client_id` and URLs. Before running `pnpm dev`, either `shopify app config link` to your own dev app or swap `client_id` and `application_url` in the TOML — otherwise the CLI refuses to connect.

### Scripts

| Command            | What it does                                |
|--------------------|---------------------------------------------|
| `pnpm dev`         | Local dev via Shopify CLI                   |
| `pnpm build`       | Production build                            |
| `pnpm typecheck`   | React Router typegen + `tsc --noEmit`       |
| `pnpm lint`        | ESLint                                      |
| `pnpm setup`       | `prisma generate && prisma migrate deploy`  |

## Project layout

```
app/              React Router routes, loaders, actions, Shopify server helpers
  routes/         _index (landing), app.* (embedded admin), auth.*, webhooks.*
  agent/          Platform-agnostic SEO agent (see Architecture above)
extensions/       Shopify theme / checkout extensions
prisma/           Schema + migrations (PostgreSQL + pgvector)
cli/              Internal admin scripts (sh-admin.mjs)
```

## Adding a new platform

1. Create `app/agent/connectors/<platform>.ts`.
2. Export a factory that returns a `Connector` (see `app/agent/types.ts`).
3. Implement `crawlSample` first — that unlocks read-only audit + memory.
4. Implement `applyEdit` + `verify` when the executor lands.
5. Re-export from `app/agent/index.ts`.

That is the entire platform onboarding cost. The auditor, planner, and memory layer stay untouched.

## Public routes

- [`/privacy`](https://grow.glitchexecutor.com/privacy) — Privacy policy
- [`/support`](https://grow.glitchexecutor.com/support) — Support contact
- [`/docs`](https://grow.glitchexecutor.com/docs) — User documentation

## GDPR compliance

The three mandatory Shopify privacy webhooks are implemented at `app/routes/webhooks.customers.data_request.jsx`, `webhooks.customers.redact.jsx`, and `webhooks.shop.redact.jsx`.

## Support

- Email — [support@glitchexecutor.com](mailto:support@glitchexecutor.com)
- Issues — [GitHub Issues](https://github.com/glitch-exec-labs/glitch-grow-ai-seo-agent/issues)

## License

MIT — see [LICENSE](./LICENSE).

<sub>© 2026 Glitch Executor Labs</sub>
