# Changelog

Auto-generated from `git log`. UTC dates, newest first.
Each entry: `time — subject (sha) — N files`; body shown as indented sub-bullets.

---

## 2026-04-15

- **02:21 UTC** — auto-sync: 2026-04-15 02:21 UTC (`ba77e16`) — 1 file
        M	.mcp.json
- **00:57 UTC** — fix: remove plan badge from dashboard (Shopify rejects pricing info in screenshots) (`5e3fab6`) — 2 files
- **00:16 UTC** — auto-sync: 2026-04-15 00:16 UTC (`0b2a750`) — 2 files
        M	shopify.app.toml
- **00:10 UTC** — feat: add GDPR compliance webhook handlers (`b89197f`) — 5 files
    - customers/data_request: no customer data held, acknowledge
    - customers/redact: no customer data held, acknowledge
    - shop/redact: delete any remaining session for the shop (defensive)
    - Webhook topics removed from shopify.app.toml (Shopify manages GDPR webhooks
      via Partner Dashboard UI only, not via CLI config)

## 2026-04-14

- **23:58 UTC** — feat: add /privacy, /support, /docs public pages + fix landing page copy (`9ec664a`) — 5 files
    - Replace scaffold '/' copy ('A short heading about [your app]') with
      real Glitch SEO positioning + install form + resource links
    - /privacy: full Shopify-review-ready privacy policy (data accessed,
      stored, NOT stored; retention; subprocessors; GDPR-style rights)
    - /support: email + common issues + feedback path
    - /docs: getting started, audit explainer, scope table, FAQ
    - All pages self-contained, no external dependencies, inline styled
      for review-friendliness
- **23:22 UTC** — docs: refresh CHANGELOG.md (`6274ce1`) — 1 file
- **23:22 UTC** — docs: add auto-generated CHANGELOG.md (`e063b7c`) — 1 file
- **23:12 UTC** — chore: initial commit — Glitch SEO public app (`d1c3926`) — 45 files
    - Shopify App Store candidate (client_id 44bf7f37..., public distribution)
    - Serves grow.glitchexecutor.com on port 3102
    - Prisma + Postgres shared with glitch-grow agency app
    - Embedded-admin dashboard with live SEO audit runner
