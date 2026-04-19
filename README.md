# Glitch Grow

A Shopify app by [Glitch Executor Labs](https://grow.glitchexecutor.com) for merchants who want to stop guessing at SEO.

Built on the Shopify App React Router template. Embedded admin UI (Polaris + App Bridge), Prisma + PostgreSQL session storage, GDPR-compliant webhook handlers.

## Stack

- React Router 7 (SSR, file-routed)
- Shopify App React Router (`@shopify/shopify-app-react-router`)
- Prisma 6 + PostgreSQL
- Polaris v12 / App Bridge v4
- Node 20.19+ / pnpm 10

## Local development

```bash
pnpm install
cp .env.example .env   # then fill in Shopify + DB credentials
pnpm prisma migrate deploy
pnpm dev               # runs `shopify app dev`
```

You need the [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) and a Shopify Partner account. The `client_id` in `shopify.app.toml` points at the production Glitch Grow app — **replace it with your own** before running `shopify app dev`, or the CLI will refuse to connect.

## Scripts

- `pnpm dev` — local dev via Shopify CLI
- `pnpm build` — production build
- `pnpm typecheck` — `tsc --noEmit` + React Router typegen
- `pnpm lint` — ESLint
- `pnpm setup` — `prisma generate && prisma migrate deploy`

## Project layout

- `app/` — React Router routes, loaders, actions, Shopify server helpers
- `extensions/` — Shopify app extensions (theme/checkout)
- `prisma/` — schema + migrations (PostgreSQL)
- `cli/` — internal admin scripts (`sh-admin.mjs`); client aliases live in a gitignored `cli/shops.json`

## Public routes

- `/privacy` — privacy policy
- `/support` — support contact
- `/docs` — user docs

## License

MIT — see [LICENSE](./LICENSE).

## Support

support@glitchexecutor.com
