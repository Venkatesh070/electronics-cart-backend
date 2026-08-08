import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../config/db";
import { Product } from "../models/Product";

/**
 * Read-only audit: flags products whose title implies a specific processor
 * family (i5/i7/i9/Apple Silicon) but whose stored "Processor" specification
 * is missing or names a different family. Never writes anything — the product
 * name is marketing text, not a source of truth, so mismatches are reported
 * for a human to confirm and correct via the admin Processor field.
 */

const INTEL_RE = /\bi([3579])\b/i;
const APPLE_RE = /\bApple\s*(M[1-9])\s*(Pro|Max|Ultra)?\b/i;

function familyFromText(text: string): string | null {
  const apple = text.match(APPLE_RE);
  if (apple) return `Apple ${apple[1]}${apple[2] ? ` ${apple[2]}` : ""}`;
  const intel = text.match(INTEL_RE);
  if (intel) return `Intel Core i${intel[1]}`;
  return null;
}

async function auditProcessorSpecs() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not set");

  await connectDB(mongoUri);

  const products = await Product.find({}, { name: 1, sku: 1, specifications: 1, variants: 1 }).lean();

  const rows: { sku: string; name: string; nameImplies: string; stored: string }[] = [];

  for (const p of products) {
    const nameImplies = familyFromText(p.name || "");
    if (!nameImplies) continue;

    const productProcessor = (p.specifications || []).find((s) =>
      /^processor$|^cpu$/i.test(s.key || "")
    )?.value;

    const variantProcessors = (p.variants || [])
      .map((v) => (v.specifications || []).find((s) => /^processor$|^cpu$/i.test(s.key || ""))?.value)
      .filter(Boolean) as string[];

    const stored = productProcessor || variantProcessors.join(" | ") || "(missing)";
    const storedFamily = familyFromText(stored);

    if (!storedFamily || storedFamily.toLowerCase() !== nameImplies.toLowerCase()) {
      rows.push({ sku: p.sku, name: p.name, nameImplies, stored });
    }
  }

  if (!rows.length) {
    console.log("No mismatches found — every product whose name implies a processor family has a matching stored Processor spec.");
  } else {
    console.log(`Found ${rows.length} product(s) where the name implies a different processor than what's stored:\n`);
    console.table(rows);
    console.log(
      "\nThese are candidates for review — verify the correct processor for each and fix it via the admin Processor field. Do NOT bulk-overwrite from the 'nameImplies' column; it's a hint, not a source of truth."
    );
  }

  await import("mongoose").then(({ default: mongoose }) => mongoose.disconnect());
}

auditProcessorSpecs().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
