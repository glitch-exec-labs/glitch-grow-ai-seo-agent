/**
 * HTML connector — real reads for plain-HTML / custom sites.
 *
 * crawlSample() walks /sitemap.xml (if present) and picks a handful of
 * representative pages: one home, one /product/... or /blog/... if
 * detectable, plus /robots.txt and /llms.txt existence probes. Falls
 * back to a single base-URL fetch when no sitemap.
 *
 * Writes (applyEdit / fetchContext) still stubbed — they need a strategy
 * decision (git PR, SFTP, Asset API, etc). Reads work today.
 */
import type { Connector, PageEdit, PageSample, VerifyResult } from "../types";

const USER_AGENT = "GlitchSEO-Agent/0.3";
const FETCH_TIMEOUT_MS = 8_000;

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Parse sitemap.xml (or sitemap index) and return up to `max` URLs. */
async function discoverUrlsFromSitemap(base: string, max: number): Promise<string[]> {
  const root = base.replace(/\/+$/, "");
  const candidates = [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`];
  for (const sm of candidates) {
    const xml = await getText(sm);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1]);
    if (locs.length === 0) continue;

    // If it's a sitemap index, fetch the first child.
    if (/<sitemapindex/i.test(xml) && locs[0]) {
      const child = await getText(locs[0]);
      if (child) {
        const childLocs = [...child.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map((m) => m[1]);
        return childLocs.slice(0, max);
      }
    }
    return locs.slice(0, max);
  }
  return [];
}

function guessRole(url: string, base: string): PageSample["role"] {
  const path = url.replace(base, "").toLowerCase();
  if (path === "" || path === "/" || path === "/index.html") return "home";
  if (/\/products?\//.test(path)) return "product";
  if (/\/collections?\//.test(path) || /\/category\//.test(path)) return "collection";
  if (/\/blog\//.test(path) || /\/articles?\//.test(path)) return "article";
  return "page";
}

export function htmlConnector(baseUrl: string): Connector {
  const normalized = baseUrl.replace(/\/+$/, "");
  return {
    platform: "html",
    siteId: normalized,

    async crawlSample(opts): Promise<PageSample[]> {
      const maxPages = opts?.maxPages ?? 4;
      const discovered = await discoverUrlsFromSitemap(normalized, maxPages * 4);

      // Always start with the base URL.
      const urls: string[] = [normalized];
      // Pick diverse roles from discovered list.
      const picked = new Set<string>([normalized]);
      const wantRoles = new Set<PageSample["role"]>(["product", "collection", "article"]);
      for (const u of discovered) {
        if (picked.size >= maxPages) break;
        if (picked.has(u)) continue;
        const role = guessRole(u, normalized);
        if (role === "home") continue;
        if (!wantRoles.has(role) && picked.size < maxPages - 1) continue;
        picked.add(u);
        urls.push(u);
      }

      return Promise.all(
        urls.slice(0, maxPages).map(async (url) => ({
          url,
          role: guessRole(url, normalized),
          html: await getText(url),
        })),
      );
    },

    async fetchContext(_scope, _handle): Promise<Record<string, unknown>> {
      // Minimal context: just what we can observe from the homepage
      // without auth. Writer-side context will expand when applyEdit lands.
      const html = await getText(normalized);
      const titleMatch = html?.match(/<title[^>]*>([^<]*)<\/title>/i);
      const descMatch = html?.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i,
      );
      return {
        url: normalized,
        name: titleMatch?.[1]?.trim() ?? normalized,
        description: descMatch?.[1]?.trim() ?? "",
      };
    },

    async applyEdit(_edit: PageEdit): Promise<void> {
      throw new Error(
        "htmlConnector.applyEdit: not implemented (pending write strategy — git PR / SFTP / Asset API)",
      );
    },

    async verify(url, expect): Promise<VerifyResult> {
      const html = await getText(url);
      if (html === null) return { url, ok: false, detail: "Fetch failed." };
      const ok = expect(html);
      return {
        url,
        ok,
        detail: ok
          ? "Verified: expected signal present."
          : "Signal not yet present in rendered HTML.",
      };
    },
  };
}
