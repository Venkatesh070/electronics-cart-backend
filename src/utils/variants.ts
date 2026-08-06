import { IProduct, IProductImage, IProductSpec, IProductVariant, IOptionType } from "../models/Product";

export type NormalizedVariant = {
  sku: string;
  barcode?: string;
  attributes: Record<string, string>;
  mrp: number;
  sellingPrice: number;
  offerPrice?: number;
  /** Live checkout price (offer if set, else selling). */
  finalPrice: number;
  discountPercent: number;
  stock: number;
  availableStock: number;
  reservedStock: number;
  minStock: number;
  maxOrderQty?: number;
  weight?: number;
  dimensions?: { length?: number; breadth?: number; height?: number };
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  images: IProductImage[];
  specifications: IProductSpec[];
  tax?: number;
  codAvailable: boolean;
  emiAvailable: boolean;
  exchangeAvailable: boolean;
  label: string;
  inStock: boolean;
};

function attrsFromLegacy(v: IProductVariant): Record<string, string> {
  const raw = v.attributes;
  let attrs: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    if (raw instanceof Map) {
      attrs = Object.fromEntries(raw.entries());
    } else {
      attrs = { ...(raw as Record<string, string>) };
    }
  }
  if (v.color && !attrs.Color) attrs.Color = v.color;
  if (v.storage && !attrs.Storage) attrs.Storage = v.storage;
  if (v.condition && !attrs.Condition) {
    attrs.Condition =
      v.condition === "refurbished" ? "Refurbished" : v.condition === "open-box" ? "Open Box" : "New";
  }
  return attrs;
}

function normalizeImages(images: unknown, fallbackUrls: string[] = []): IProductImage[] {
  if (Array.isArray(images) && images.length) {
    return images
      .map((img, i) => {
        if (typeof img === "string") return { url: img, isPrimary: i === 0 };
        if (img && typeof img === "object" && "url" in img) {
          return { url: String((img as IProductImage).url), isPrimary: !!(img as IProductImage).isPrimary || i === 0 };
        }
        return null;
      })
      .filter(Boolean) as IProductImage[];
  }
  return fallbackUrls.map((url, i) => ({ url, isPrimary: i === 0 }));
}

export function normalizeVariant(v: IProductVariant): NormalizedVariant {
  const attributes = attrsFromLegacy(v);
  const sellingPrice = Number(v.sellingPrice ?? v.price ?? 0) || 0;
  const mrp = Number(v.mrp ?? sellingPrice) || sellingPrice;
  const offerPrice =
    v.offerPrice != null && Number(v.offerPrice) > 0 && Number(v.offerPrice) < sellingPrice
      ? Number(v.offerPrice)
      : undefined;
  const finalPrice = offerPrice ?? sellingPrice;
  const discountPercent = mrp > finalPrice && mrp > 0 ? Math.round(((mrp - finalPrice) / mrp) * 100) : 0;
  const stock = Math.max(0, Number(v.stock) || 0);
  const reservedStock = Math.max(0, Number(v.reservedStock) || 0);
  const availableStock = Math.max(0, stock - reservedStock);
  const images = normalizeImages(v.images);
  const status = (v.status as "ACTIVE" | "INACTIVE") || "ACTIVE";
  const label =
    Object.values(attributes).filter(Boolean).join(" · ") || v.sku || "Default";

  return {
    sku: String(v.sku || "").toUpperCase(),
    barcode: v.barcode,
    attributes,
    mrp,
    sellingPrice,
    offerPrice,
    finalPrice,
    discountPercent,
    stock,
    availableStock,
    reservedStock,
    minStock: Number(v.minStock) || 0,
    maxOrderQty: v.maxOrderQty,
    weight: v.weight,
    dimensions: v.dimensions,
    status,
    isDefault: !!v.isDefault,
    isFeatured: !!v.isFeatured,
    isBestSeller: !!v.isBestSeller,
    images,
    specifications: Array.isArray(v.specifications) ? v.specifications : [],
    tax: v.tax,
    codAvailable: v.codAvailable !== false,
    emiAvailable: v.emiAvailable !== false,
    exchangeAvailable: !!v.exchangeAvailable,
    label,
    inStock: availableStock > 0 && status === "ACTIVE",
  };
}

export function listActiveVariants(product: IProduct | { variants?: IProductVariant[] }): NormalizedVariant[] {
  const raw = product.variants || [];
  return raw.map(normalizeVariant).filter((v) => v.status === "ACTIVE" && v.sku);
}

export function findVariant(
  product: IProduct | { variants?: IProductVariant[]; defaultVariantSku?: string },
  variantSku?: string | null
): NormalizedVariant | null {
  const all = listActiveVariants(product);
  if (!all.length) return null;
  if (variantSku) {
    const hit = all.find((v) => v.sku === String(variantSku).toUpperCase());
    if (hit) return hit;
  }
  const defSku = product.defaultVariantSku;
  if (defSku) {
    const def = all.find((v) => v.sku === String(defSku).toUpperCase());
    if (def) return def;
  }
  return all.find((v) => v.isDefault) || all[0] || null;
}

/** Resolve live unit price — variant when present, else product.price. */
export function resolveUnitPrice(
  product: IProduct & { price: number },
  variantSku?: string | null
): { price: number; mrp: number; variant: NormalizedVariant | null; stock: number } {
  const variant = findVariant(product, variantSku);
  if (variant) {
    return { price: variant.finalPrice, mrp: variant.mrp, variant, stock: variant.availableStock };
  }
  return {
    price: Number(product.price) || 0,
    mrp: Number(product.originalPrice || product.price) || 0,
    variant: null,
    stock: Math.max(0, Number(product.stock) || 0),
  };
}

export function deriveOptionTypes(
  variants: NormalizedVariant[],
  declared?: IOptionType[]
): IOptionType[] {
  if (declared?.length) {
    return declared.map((o) => ({
      name: o.name,
      values: [...new Set((o.values || []).map(String).filter(Boolean))],
    }));
  }
  const order: string[] = [];
  const map = new Map<string, Set<string>>();
  for (const v of variants) {
    for (const [key, value] of Object.entries(v.attributes)) {
      if (!value) continue;
      if (!map.has(key)) {
        map.set(key, new Set());
        order.push(key);
      }
      map.get(key)!.add(value);
    }
  }
  return order.map((name) => ({ name, values: [...map.get(name)!] }));
}

export function matchVariantBySelection(
  variants: NormalizedVariant[],
  selection: Record<string, string>
): NormalizedVariant | null {
  const keys = Object.keys(selection).filter((k) => selection[k]);
  if (!keys.length) return variants[0] || null;
  const exact = variants.find((v) => keys.every((k) => v.attributes[k] === selection[k]));
  if (exact) return exact;
  // Soft match: prefer most matching attributes
  let best: NormalizedVariant | null = null;
  let bestScore = -1;
  for (const v of variants) {
    let score = 0;
    for (const k of keys) {
      if (v.attributes[k] === selection[k]) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return bestScore > 0 ? best : variants[0] || null;
}

export function availableValuesFor(
  variants: NormalizedVariant[],
  selection: Record<string, string>,
  optionName: string
): { value: string; available: boolean; inStock: boolean }[] {
  const values = [...new Set(variants.map((v) => v.attributes[optionName]).filter(Boolean))];
  return values.map((value) => {
    const probe = { ...selection, [optionName]: value };
    const match = variants.find((v) =>
      Object.keys(probe).every((k) => !probe[k] || v.attributes[k] === probe[k])
    );
    const anyWithValue = variants.filter((v) => v.attributes[optionName] === value);
    return {
      value,
      available: !!match,
      inStock: anyWithValue.some((v) => v.inStock),
    };
  });
}

/** Roll product list price/stock/images up from variants (Amazon parent product). */
export function syncProductAggregates(product: IProduct): void {
  const active = listActiveVariants(product);
  if (!active.length) return;

  const prices = active.map((v) => v.finalPrice);
  const mrps = active.map((v) => v.mrp);
  product.price = Math.min(...prices);
  product.originalPrice = Math.max(...mrps);
  if (product.originalPrice > product.price) {
    product.discount = Math.round(
      ((product.originalPrice - product.price) / product.originalPrice) * 100
    );
  }
  product.stock = active.reduce((n, v) => n + v.availableStock, 0);

  const def =
    active.find((v) => v.sku === product.defaultVariantSku) ||
    active.find((v) => v.isDefault) ||
    active[0];
  if (def?.images?.length && (!product.images || !product.images.length)) {
    product.images = def.images;
  }
  if (!product.defaultVariantSku && def) {
    product.defaultVariantSku = def.sku;
  }
  if (!product.optionTypes?.length) {
    product.optionTypes = deriveOptionTypes(active);
  }
}

export function buildVariantPayload(product: IProduct) {
  const variants = listActiveVariants(product);
  const optionTypes = deriveOptionTypes(variants, product.optionTypes);
  const prices = variants.map((v) => v.finalPrice);
  return {
    variants,
    optionTypes,
    defaultVariantSku: product.defaultVariantSku || variants.find((v) => v.isDefault)?.sku || variants[0]?.sku || null,
    priceRange:
      prices.length > 0
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : { min: product.price, max: product.price },
    availableOptions: Object.fromEntries(optionTypes.map((o) => [o.name, o.values])),
    hasVariants: variants.length > 0,
  };
}
