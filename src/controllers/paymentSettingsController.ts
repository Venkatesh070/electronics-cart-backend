import { Request, Response } from "express";
import { PaymentGatewaySettings } from "../models/PaymentGatewaySettings";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { isRazorpayConfigured } from "../config/razorpay";

/** Built-in methods — always shown in admin; drive checkout availability. */
export const KNOWN_GATEWAYS = [
  {
    provider: "razorpay",
    label: "Pay Online (UPI / Card / Netbanking)",
    description: "Razorpay checkout for UPI, cards, and netbanking",
    defaultEnabled: true,
    credentialKeys: ["keyId", "keySecret"],
    requiresCredentials: true,
  },
  {
    provider: "emi",
    label: "EMI on Credit / Debit Card",
    description: "Customer picks bank tenure in Razorpay checkout",
    defaultEnabled: true,
    credentialKeys: [] as string[],
    requiresCredentials: false,
  },
  {
    provider: "COD",
    label: "Cash on Delivery",
    description: "Collect payment when the order is delivered",
    defaultEnabled: true,
    credentialKeys: [] as string[],
    requiresCredentials: false,
  },
] as const;

function normalizeProvider(value: string) {
  const raw = String(value || "").trim();
  if (/^cod$/i.test(raw)) return "COD";
  if (/^emi$/i.test(raw)) return "emi";
  if (/^razorpay$/i.test(raw)) return "razorpay";
  return raw.toLowerCase();
}

function metaFor(provider: string) {
  return KNOWN_GATEWAYS.find((g) => g.provider === provider);
}

export async function getEnabledPaymentMethods() {
  const gateways = await PaymentGatewaySettings.find();
  const byProvider = new Map(gateways.map((g) => [normalizeProvider(g.provider), g]));
  const razorpayOnline =
    isRazorpayConfigured() || process.env.PAYMENTS_MOCK === "true";

  return KNOWN_GATEWAYS.map((known) => {
    const stored = byProvider.get(known.provider);
    const enabled =
      stored != null ? Boolean(stored.enabled) : known.defaultEnabled;
    const onlineOk =
      known.provider === "COD" ? true : razorpayOnline;
    return {
      id: known.provider,
      label: known.label,
      description: known.description,
      enabled: enabled && onlineOk,
    };
  }).filter((m) => m.enabled);
}

export const listGateways = asyncHandler(async (_req: Request, res: Response) => {
  const gateways = await PaymentGatewaySettings.find().select("+credentials");
  const byProvider = new Map(gateways.map((g) => [normalizeProvider(g.provider), g]));

  const known = KNOWN_GATEWAYS.map((known) => {
    const stored = byProvider.get(known.provider);
    byProvider.delete(known.provider);
    return {
      _id: stored?._id,
      provider: known.provider,
      label: known.label,
      description: known.description,
      enabled: stored != null ? Boolean(stored.enabled) : known.defaultEnabled,
      settlementAccount: stored?.settlementAccount || "",
      credentialsSet: Object.keys(stored?.credentials || {}).length > 0,
      credentialKeys: [...known.credentialKeys],
      requiresCredentials: known.requiresCredentials,
      envConfigured:
        known.provider === "razorpay"
          ? isRazorpayConfigured() || process.env.PAYMENTS_MOCK === "true"
          : true,
      known: true,
    };
  });

  const custom = [...byProvider.values()].map((g) => ({
    _id: g._id,
    provider: g.provider,
    label: g.provider,
    description: "",
    enabled: Boolean(g.enabled),
    settlementAccount: g.settlementAccount || "",
    credentialsSet: Object.keys(g.credentials || {}).length > 0,
    credentialKeys: ["keyId", "keySecret"],
    requiresCredentials: true,
    envConfigured: false,
    known: false,
  }));

  res.json({ success: true, data: [...known, ...custom] });
});

export const upsertGateway = asyncHandler(async (req: Request, res: Response) => {
  const provider = normalizeProvider(req.body.provider || "");
  if (!provider) throw new ApiError(400, "provider is required");

  const existing = await PaymentGatewaySettings.findOne({ provider }).select("+credentials");
  const update: Record<string, unknown> = {};

  if (typeof req.body.enabled === "boolean") update.enabled = req.body.enabled;
  if (req.body.settlementAccount !== undefined) {
    update.settlementAccount = String(req.body.settlementAccount || "").trim() || undefined;
  }

  if (req.body.credentials && typeof req.body.credentials === "object") {
    const incoming = Object.fromEntries(
      Object.entries(req.body.credentials as Record<string, string>)
        .map(([k, v]) => [String(k).trim(), String(v ?? "").trim()])
        .filter(([k, v]) => k && v)
    );
    if (Object.keys(incoming).length) {
      update.credentials = { ...(existing?.credentials || {}), ...incoming };
    }
  }

  if (!existing && typeof update.enabled !== "boolean") {
    update.enabled = metaFor(provider)?.defaultEnabled ?? false;
  }

  const gateway = await PaymentGatewaySettings.findOneAndUpdate(
    { provider },
    { $set: update },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  res.json({
    success: true,
    data: {
      provider: gateway.provider,
      enabled: gateway.enabled,
      settlementAccount: gateway.settlementAccount,
      label: metaFor(gateway.provider)?.label || gateway.provider,
    },
  });
});
