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

- **Audit.** One-click pass/fail checklist across structured data, breadcrumbs, canonical tags, and `og:image` — run against the live storefront.
- **Schema coverage.** Product JSON-LD with `category`, `material`, and `additionalProperty`. `FAQPage` and `BreadcrumbList` wired into the theme via App Embed blocks.
- **AI search ready.** Generates `llms.txt` and rewrites product copy into a format that traditional search and AI answer engines can cite.

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
extensions/       Shopify theme / checkout extensions
prisma/           Schema + migrations (PostgreSQL)
cli/              Internal admin scripts (sh-admin.mjs)
```

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
