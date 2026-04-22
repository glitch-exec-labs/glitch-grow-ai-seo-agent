#!/usr/bin/env node
/**
 * seed-brand — one-shot ClientMemory + metafield seeder.
 *
 * Seeds both the Postgres ClientMemory row AND the Shopify shop
 * metafield glitch_grow_seo.gtm_container_id in one pass, so the
 * theme app embed block can find the container id the moment the
 * merchant enables it.
 *
 * Usage:
 *   node cli/seed-brand.mjs --shop <.myshopify.com> \
 *     --brand "Name" --gsc "https://brand.com/" --gtm GTM-XXX
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();
const API_VERSION = '2025-01';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

function die(msg) { console.error(`seed-brand: ${msg}`); process.exit(1); }

const shop = arg('shop') || die('--shop required');
const brand = arg('brand') || null;
const gsc = arg('gsc') || null;
const gtm = arg('gtm') || null;

const session = await prisma.session.findFirst({
  where: { shop, isOnline: false },
  orderBy: { id: 'asc' },
});
if (!session) die(`no offline session for ${shop}`);
const token = session.accessToken;

/* ─── ClientMemory upsert ───────────────────────────────── */
const cm = await prisma.clientMemory.upsert({
  where: { siteId: shop },
  create: {
    siteId: shop,
    platform: 'shopify',
    brandName: brand,
    gscProperty: gsc,
    gtmContainerId: gtm,
  },
  update: {
    brandName: brand,
    gscProperty: gsc,
    gtmContainerId: gtm,
  },
});
console.log(`  ✓ ClientMemory ${cm.id} — brand=${brand} gsc=${gsc} gtm=${gtm}`);

/* ─── Shopify metafield write ───────────────────────────── */
if (gtm) {
  const shopGidRes = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query: '{ shop { id } }' }),
  }).then((r) => r.json());
  const ownerId = shopGidRes?.data?.shop?.id;
  if (!ownerId) die('could not resolve shop gid');

  const mutation = `
    mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key }
        userErrors { field message }
      }
    }`;
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: mutation,
      variables: {
        metafields: [{
          ownerId,
          namespace: 'glitch_grow_seo',
          key: 'gtm_container_id',
          type: 'single_line_text_field',
          value: gtm,
        }],
      },
    }),
  }).then((r) => r.json());
  const errs = res?.data?.metafieldsSet?.userErrors || [];
  if (errs.length) die(`metafieldsSet: ${JSON.stringify(errs)}`);
  console.log(`  ✓ shop metafield glitch_grow_seo.gtm_container_id = ${gtm}`);
}

await prisma.$disconnect();
