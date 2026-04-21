/**
 * Per-product override of ClientMemory. Merged on top of the site-level
 * profile so an individual product can carry its own voice / keyTerms /
 * avoidTerms without losing the shop-wide context.
 */
import prisma from "../db.server";
import type { ClientMemory } from "./clientMemory";

export interface ProductMemory {
  siteId: string;
  productHandle: string;
  brandVoice?: string | null;
  keyTerms: string[];
  avoidTerms: string[];
  notes?: string | null;
}

export async function loadProductMemory(
  siteId: string,
  productHandle: string,
): Promise<ProductMemory | null> {
  try {
    const row = await prisma.productMemory.findUnique({
      where: { siteId_productHandle: { siteId, productHandle } },
    });
    return row
      ? {
          siteId: row.siteId,
          productHandle: row.productHandle,
          brandVoice: row.brandVoice,
          keyTerms: row.keyTerms ?? [],
          avoidTerms: row.avoidTerms ?? [],
          notes: row.notes,
        }
      : null;
  } catch {
    return null;
  }
}

export async function saveProductMemory(
  siteId: string,
  productHandle: string,
  patch: Partial<ProductMemory>,
): Promise<ProductMemory> {
  const data: Record<string, unknown> = {};
  if ("brandVoice" in patch) data.brandVoice = patch.brandVoice ?? null;
  if ("notes" in patch) data.notes = patch.notes ?? null;
  if ("keyTerms" in patch && Array.isArray(patch.keyTerms)) data.keyTerms = patch.keyTerms;
  if ("avoidTerms" in patch && Array.isArray(patch.avoidTerms)) data.avoidTerms = patch.avoidTerms;

  const row = await prisma.productMemory.upsert({
    where: { siteId_productHandle: { siteId, productHandle } },
    create: { siteId, productHandle, ...(data as object) },
    update: data as object,
  });
  return {
    siteId: row.siteId,
    productHandle: row.productHandle,
    brandVoice: row.brandVoice,
    keyTerms: row.keyTerms ?? [],
    avoidTerms: row.avoidTerms ?? [],
    notes: row.notes,
  };
}

/**
 * Merge ProductMemory onto ClientMemory. Product-level fields override
 * site-level; keyTerms/avoidTerms are union'd rather than replaced so
 * the product picks up shop-wide terms plus its own.
 */
export function mergeMemory(
  site: ClientMemory | null,
  product: ProductMemory | null,
): ClientMemory | null {
  if (!site && !product) return null;
  if (!product) return site;
  const base: ClientMemory = site ?? {
    siteId: product.siteId,
    platform: "shopify",
    brandName: null,
    tagline: null,
    brandVoice: null,
    targetAudience: null,
    differentiators: null,
    categories: [],
    keyTerms: [],
    avoidTerms: [],
    shippingInfo: null,
    returnsInfo: null,
    sameAs: [],
    notes: null,
  };
  const keyTerms = union(base.keyTerms, product.keyTerms);
  const avoidTerms = union(base.avoidTerms, product.avoidTerms);
  return {
    ...base,
    brandVoice: product.brandVoice ?? base.brandVoice,
    keyTerms,
    avoidTerms,
    notes: product.notes ?? base.notes,
  };
}

function union(a: string[], b: string[]): string[] {
  const set = new Set<string>();
  [...a, ...b].forEach((s) => s && set.add(s));
  return [...set];
}
