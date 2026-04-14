# Changelog — `glitch-grow-public`

Auto-regenerated from `git log` by `/home/support/bin/changelog-regen`,
called before every push by `/home/support/bin/git-sync-all` (cron `*/15 * * * *`).

**Purpose:** traceability. If a push broke something, scan dates + short SHAs
here; then `git show <sha>` to see the diff, `git revert <sha>` to undo.

**Format:** UTC dates, newest first. Each entry: `time — subject (sha) — N files`.
Body text (if present) shown as indented sub-bullets.

---

## 2026-04-14

- **23:12 UTC** — chore: initial commit — Glitch SEO public app (`d1c3926`) — 45 files
    - Shopify App Store candidate (client_id 44bf7f37..., public distribution)
    - Serves grow.glitchexecutor.com on port 3102
    - Prisma + Postgres shared with glitch-grow agency app
    - Embedded-admin dashboard with live SEO audit runner
