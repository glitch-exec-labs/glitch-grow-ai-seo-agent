# Changelog — `glitch-grow-public`

Auto-regenerated from `git log` by `/home/support/bin/changelog-regen`,
called before every push by `/home/support/bin/git-sync-all` (cron `*/15 * * * *`).

**Purpose:** traceability. If a push broke something, scan dates + short SHAs
here; then `git show <sha>` to see the diff, `git revert <sha>` to undo.

**Format:** UTC dates, newest first. Each entry: `time — subject (sha) — N files`.
Body text (if present) shown as indented sub-bullets.

---

## 2026-04-22

- **09:45 UTC** — auto-sync: 2026-04-22 09:45 UTC (`7b4963f`) — 2 files
        A	agent/scripts/audit_gtm.py
        A	agent/src/glitch_seo_agent/clients/tag_manager.py
- **09:40 UTC** — feat(agent): direct theme.liquid GTM installer for the 4 brand stores (`ff1e0af`) — 2 files
    Follows the ops pattern documented by the operator (reads STORES_JSON
    from glitch-grow-ads-agent/.env, pulls tokens from the
    multi-store-theme-manager Postgres Session table, verifies
    write_themes scope, backs up, PUTs, verify-with-retry, clears the
    now-redundant shop metafield so the theme-app-embed cannot
    double-fire).
    agent/scripts/install_gtm.py:
    - Idempotent: inserts a marker comment and skips on re-run.
    - Dry-run mode (--dry-run).
    - Per-slug mode (--slug storico).
- **09:15 UTC** — auto-sync: 2026-04-22 09:15 UTC (`4a51c8b`) — 8 files
        M	app/agent/clientMemory.ts
        M	app/routes/app.client-memory.jsx
        A	cli/seed-brand.mjs
        A	extensions/glitch-grow-seo-schema/blocks/gtm-body.liquid
        M	extensions/glitch-grow-seo-schema/blocks/schema.liquid
        ... (+2 more)
- **07:52 UTC** — feat(agent): Gemini LLM provider — 2.5-flash + gemini-embedding-001 @ 1536d (`55409d8`) — 12 files
    Replace OpenAI as the primary LLM behind a provider abstraction so
    both stay wired without code-site changes.
    - New app/agent/llmClient.ts:
      - complete({ system, user, format, maxTokens, temperature })
        returns { text, model, provider, error? } — fail-open, never throws
      - embed(text) returns 1536-dim vector regardless of provider
      - activeProvider(): picks AGENT_LLM_PROVIDER explicitly, else
        auto-detects Gemini > OpenAI based on which key is set
    - llmEnabled(): accepts either provider's key under live mode.
    - Every LLM call site now routes through llmClient:
- **07:31 UTC** — chore(agent): drop SERP from v1 — Google deprecated "Search entire web" (`b30b524`) — 1 file
    Context: Programmable Search Engines created after Oct 2024 cannot
    enable "Search the entire web" anymore; the feature is deprecated.
    Custom Search JSON now only queries a caller-supplied site list,
    which defeats the original "where does our brand rank" use case.
    GSC top_queries already gives the same signal for our own sites.
    - reports/daily.py: drop serp_pull call + snapshot field + DB column.
      SeoReport.serp column stays (nullable) — future paid SERP provider
      can still write to it without another migration.
    - pulls/serp.py: kept as scaffolding with an explicit "not wired"
      docstring pointing at two paths forward (competitor-list CSE or
- **07:30 UTC** — auto-sync: 2026-04-22 07:30 UTC (`c45e438`) — 3 files
        M	agent/src/glitch_seo_agent/pulls/serp.py
        M	agent/src/glitch_seo_agent/reports/daily.py
- **06:54 UTC** — feat(agent): A + B + C — planner reads SeoReport, /fleet drill-down, Custom Search (`fe0404d`) — 17 files
    Three linked upgrades landing in one commit.
    A. Node planner now reads SeoReport (GSC + PSI + NLP) and weights
       findings by real impressions.
       - app/agent/seoReport.ts: typed read-side accessor; returns the
         latest report per siteId plus a <site_traffic> prompt block
       - runner.ts: fetches traffic before calling plan(); threads it
         through as siteTraffic
       - llm.ts: new PlannerInput.siteTraffic; system prompt explicitly
         instructs: a failing signal on a 2000-impression page is critical,
         the same signal on a 0-impression page is info
- **06:35 UTC** — fix(agent): PSI key reads from pydantic-settings (not os.environ) (`0aa4c2c`) — 2 files
    PAGESPEED_API_KEY was never reaching the request — the env var is
    loaded by pydantic-settings into the Settings model but never exported
    to os.environ. The pagespeed client was reading via os.environ.get so
    the key stayed invisible and every call burnt 429 quota.
    Fix: declare pagespeed_api_key on Settings and read it via settings()
    in the client. Verified: all 4 fleet sites now return real PSI scores.
      grow-site         perf_median 0.42
      trade-site        perf_median 0.67
      edge-site         perf_median 0.65
      exec-portfolio    perf_median 0.65
- **06:22 UTC** — fix(agent): NLP entity pipeline — strip <script>/<style> + filter before slice (`b98da41`) — 1 file
    Two bugs in the entity pull:
    1. _strip_html kept inlined <script> and <style> contents — on Astro
       sites this means JSON-LD blobs and hydration state polluted the NLP
       input, producing thousands of NUMBER entities from embedded IDs,
       prices, and coords.
       Fix: strip <script>/<style>/<noscript> blocks (including contents)
       and HTML comments before tag stripping.
    2. Entity truncation happened before semantic filtering. NLP returns
       entities ordered roughly by first-occurrence, which on long pages
       means NUMBER/DATE tokens fill the first 50 slots and the real
- **06:16 UTC** — fix(agent): PSI API-key support + semantic-type filter for NLP entities (`dc9aeed`) — 3 files
    - clients/pagespeed.py: reads PAGESPEED_API_KEY from env and appends
      it to the request; unkeyed is fine for a daily 4-site cron but hits
      429 under burst/probe usage. Documented in .env.example.
    - pulls/entities.py: NLP returns many NUMBER / DATE / PRICE / PHONE
      entities on marketing pages (metrics callouts, pricing) that crowd
      out the useful signal. Filter top_entities to SEMANTIC_TYPES only
      (PERSON, ORGANIZATION, LOCATION, EVENT, WORK_OF_ART, CONSUMER_GOOD,
      OTHER) so the aggregate reflects brand / product / venue names.
      Per-page `entities[]` still contains the full set for drill-down.
    First real report against grow-site ran cleanly end to end:
- **06:09 UTC** — feat(agent): Python signal-pull layer — GSC + PSI + NLP, platform-agnostic (`57a9a01`) — 28 files
    Adds a Python sibling package at agent/ that runs long-running
    Google-API pulls for every enrolled site (Astro fleet + Shopify
    merchants + future SiteConnection sources) and writes SeoReport rows
    that the Node app reads read-only.
    Core ideology preserved: one pipeline, many platforms. Python never
    references "fleet" or "shopify" directly; it iterates SiteRecord
    objects yielded by pluggable source loaders.
    Python package
    - agent/pyproject.toml: httpx, pydantic, pydantic-settings, structlog,
      asyncpg, google-auth, google-api-python-client, google-cloud-language,
- **06:00 UTC** — auto-sync: 2026-04-22 06:00 UTC (`ac4591c`) — 8 files
        M	.gitignore
        A	agent/README.md
        A	agent/pyproject.toml
        A	agent/src/glitch_seo_agent/__init__.py
        A	agent/src/glitch_seo_agent/config.py
        ... (+2 more)

## 2026-04-21

- **07:01 UTC** — feat(fleet): same-box rebuilds — applyEdit → debounced local build (`b2fda04`) — 5 files
    The fleet runs on the same server as the agent, so deploys are a
    local \`pnpm build\` (plus a process-manager restart for SSR sites).
    Wire that up:
    - FleetSite gets optional buildDir + buildCommand in fleet.json.
      Present → site is SSG/local-served and needs a rebuild after edits.
      Absent → site is SSR and picks up artifacts on next request.
    - app/agent/rebuild.ts: in-memory rebuild state per site, spawns
      \`sh -c \$buildCommand\` in \$buildDir via child_process, captures
      tail of stdout/stderr. 15 s debounce coalesces bursts of edits
      into one rebuild. If an edit arrives while a rebuild is running,
- **07:00 UTC** — auto-sync: 2026-04-21 07:00 UTC (`6d85255`) — 4 files
        M	app/agent/connectors/html.ts
        M	app/agent/fleet.ts
        A	app/agent/rebuild.ts
- **06:33 UTC** — feat(fleet): Astro write strategy via PublishedArtifact + public API (`0bf0931`) — 10 files
    Closes the write loop for HTML / Astro fleet sites so the agent can
    actually fix them, not just audit.
    Architecture
    - New PublishedArtifact Prisma model (migration 20260421150000):
      one row per (siteId, scope, pageKey, kind, key), upserted on every
      applyEdit so the latest published version wins without history.
    - htmlConnector.applyEdit now implemented: serializes PageEdit into a
      PublishedArtifact row. No per-site git plumbing — everything lives
      in the agent's DB.
    - Two new public endpoints:
- **06:04 UTC** — feat(fleet): audit our own Astro fleet for self-testing (`5d5ab26`) — 10 files
    Config-file-driven fleet registration, CLI runner, status page.
    - fleet.json (gitignored) / FLEET_SITES_JSON env: list of sites with
      id, name, baseUrl, platform ("astro"|"html"|"shopify"|"wix").
    - fleet.example.json: committed template with the four marketing sites
      as an example shape.
    - app/agent/fleet.ts: loader that reads file or inline env JSON.
    - cli/audit-fleet.ts + `pnpm audit-fleet [id]`: iterates fleet, runs
      runAudit via htmlConnector, prints summary. Cron-safe.
    - app/routes/fleet.jsx: status page at /fleet?token=$ADMIN_TOKEN
      showing each site's latest audit pass/fail ratio. Unauth but
- **05:54 UTC** — feat(agent): kill switch, proposer, product memory, runs UI, cron, html reads (`db4ab21`) — 23 files
    Five-item bundle wired behind a cost-safe default.
    COST SAFETY
    - New central LLM kill switch (app/agent/llmEnabled.ts) gating every
      OpenAI path: planner, all generators, embeddings, proposer.
    - Default AGENT_LLM_MODE=off. Production deploys cannot burn credits
      until the operator explicitly sets AGENT_LLM_MODE=live.
    - Cron endpoint double-gated (AGENT_CRON_ENABLED + AGENT_CRON_TOKEN).
    AGENT-PROPOSED CLIENT-MEMORY FACTS
    - app/agent/proposer.ts: post-audit LLM call that suggests additions to
      ClientMemory (voice, keyTerms, sameAs, etc.) grounded in observed HTML.
- **04:16 UTC** — feat(agent): client memory — brand profile threaded through all generators (`1dcdf03`) — 6 files
    Adds ClientMemory: a stable per-site brand/positioning profile that
    every LLM generator reads on every edit. Distinct from AgentMemory
    (per-run episodic log).
    - prisma: ClientMemory model (brandName, tagline, voice, audience,
      differentiators, categories, keyTerms, avoidTerms, shipping/returns,
      sameAs, notes) + migration 20260421130000_client_memory
    - app/agent/clientMemory.ts: load / save / ensure / renderForPrompt
    - Runner auto-seeds from shop context on first audit; never overwrites
      merchant-provided fields
    - Every LLM generator (faq, llmstxt, copy, meta) injects client_memory
- **04:15 UTC** — auto-sync: 2026-04-21 04:15 UTC (`bc1720e`) — 12 files
        A	app/agent/clientMemory.ts
        M	app/agent/generators/breadcrumb.ts
        M	app/agent/generators/copy.ts
        M	app/agent/generators/faq.ts
        M	app/agent/generators/index.ts
        ... (+6 more)
- **04:07 UTC** — feat(agent): executor — preview-first writes, theme extension, llms.txt (`b674598`) — 24 files
    Second-pass agent now plans, generates, previews, applies, and verifies
    concrete edits. Planner moved from Anthropic → OpenAI gpt-4o for both
    the planner and memory embeddings (single OPENAI_API_KEY).
    Generators (app/agent/generators/):
    - organization, website, product, breadcrumb   (deterministic JSON-LD)
    - faq, meta, llmstxt, copy                     (LLM-generated content)
    Connector writes (app/agent/connectors/shopify.ts):
    - applyEdit dispatches on PageEdit kind
      jsonld  → metafieldsSet under glitch_grow_seo namespace
      meta    → metafieldsSet (title + description)
- **03:44 UTC** — feat(agent): v0 platform-agnostic SEO agent (`153342e`) — 18 files
    Core agent + Shopify connector + HTML/Wix stubs. One auditor, planner,
    memory, and runner; pluggable connectors implement the same capability
    interface so the same agent runs across any platform.
    - app/agent/types.ts: Connector interface + Signal / Finding / RunResult
    - app/agent/signals.ts: deterministic regex signal extraction
    - app/agent/llm.ts: Anthropic planner (fail-open if no API key)
    - app/agent/embeddings.ts: OpenAI embedding shim
    - app/agent/memory.ts: pgvector + recency-decay hybrid retrieval
    - app/agent/runner.ts: crawl → signals → recall → plan → persist
    - app/agent/connectors/{shopify.ts, html.ts, wix.ts}
- **03:24 UTC** — docs: rename to Glitch Grow AI SEO Agent (`a11613f`) — 1 file
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **03:23 UTC** — docs: rename to AI SEO Agent (`3b57e17`) — 1 file
    Rebrand README heading/tagline and update repo slug links.
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **03:19 UTC** — docs: update repo slug in README to glitch-grow-ai-seo (`f64172e`) — 1 file
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

## 2026-04-20

- **22:54 UTC** — Update docs after public repo renames (`115c1e2`) — 1 file
- **20:49 UTC** — Polish branding for Glitch Executor Labs public positioning (`7479a2c`) — 1 file

## 2026-04-19

- **21:36 UTC** — docs: polish README for public repo (`aada919`) — 1 file
    Add tagline, badges, feature list, stack table, scripts table, project
    layout, GDPR section, support + license footer.
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **21:36 UTC** — docs: clean CHANGELOG preamble for public repo (`c23fd0f`) — 1 file
    Strip references to internal generator paths and cron schedule.
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
- **20:35 UTC** — chore: prepare repo for public release (`c391fc7`) — 4 files
    - remove cli/shops.json (customer shop domains) from tree + gitignore
    - drop hardcoded customer alias fallback in cli/sh-admin.mjs
    - add MIT LICENSE
    - rewrite README for Glitch Grow (was untouched Shopify template)
    Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

## 2026-04-15

- **02:21 UTC** — auto-sync: 2026-04-15 02:21 UTC (`5344584`) — 2 files
        M	.mcp.json
- **00:57 UTC** — fix: remove plan badge from dashboard (Shopify rejects pricing info in screenshots) (`0478893`) — 2 files
- **00:16 UTC** — auto-sync: 2026-04-15 00:16 UTC (`3434abf`) — 2 files
        M	shopify.app.toml
- **00:10 UTC** — feat: add GDPR compliance webhook handlers (`8ae60e1`) — 5 files
    - customers/data_request: no customer data held, acknowledge
    - customers/redact: no customer data held, acknowledge
    - shop/redact: delete any remaining session for the shop (defensive)
    - Webhook topics removed from shopify.app.toml (Shopify manages GDPR webhooks
      via Partner Dashboard UI only, not via CLI config)

## 2026-04-14

- **23:58 UTC** — feat: add /privacy, /support, /docs public pages + fix landing page copy (`be932b5`) — 5 files
    - Replace scaffold '/' copy ('A short heading about [your app]') with
      real Glitch SEO positioning + install form + resource links
    - /privacy: full Shopify-review-ready privacy policy (data accessed,
      stored, NOT stored; retention; subprocessors; GDPR-style rights)
    - /support: email + common issues + feedback path
    - /docs: getting started, audit explainer, scope table, FAQ
    - All pages self-contained, no external dependencies, inline styled
      for review-friendliness
- **23:22 UTC** — docs: refresh CHANGELOG.md (`29647bf`) — 1 file
- **23:22 UTC** — docs: add auto-generated CHANGELOG.md (`8504c2b`) — 1 file
- **23:12 UTC** — chore: initial commit — Glitch SEO public app (`ec08f26`) — 44 files
    - Shopify App Store candidate (client_id 44bf7f37..., public distribution)
    - Serves grow.glitchexecutor.com on port 3102
    - Prisma + Postgres shared with glitch-grow agency app
    - Embedded-admin dashboard with live SEO audit runner
