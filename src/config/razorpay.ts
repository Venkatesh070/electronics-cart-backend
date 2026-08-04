import crypto from "crypto";
import { ApiError } from "../utils/ApiError";

// CommonJS default export from the razorpay package
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require("razorpay");

let client: any = null;

export function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getRazorpayKeyId() {
  if (!process.env.RAZORPAY_KEY_ID) {
    throw new ApiError(500, "Razorpay is not configured (missing RAZORPAY_KEY_ID)");
  }
  return process.env.RAZORPAY_KEY_ID;
}

export function getRazorpay() {
  if (!isRazorpayConfigured()) {
    throw new ApiError(500, "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });
  }
  return client;
}

export function toPaise(amountInr: number) {
  return Math.round(Number(amountInr) * 100);
}

export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new ApiError(500, "Razorpay is not configured");

  const body = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(params.razorpaySignature || "");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ApiError(400, "Invalid Razorpay payment signature");
  }
}

export function isOnlinePaymentMethod(method?: string) {
  const value = String(method || "").trim().toLowerCase();
  return ["razorpay", "upi", "card", "online", "netbanking", "wallet", "emi"].includes(value);
}

export function isWebhookConfigured() {
  return Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);
}

/**
 * Verifies the `X-Razorpay-Signature` header against the raw webhook body.
 * Must be called with the exact bytes Razorpay sent (before any JSON parsing/re-serialization),
 * since the signature is an HMAC over the raw request body.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new ApiError(500, "Razorpay webhook secret is not configured");
  if (!signature) throw new ApiError(400, "Missing X-Razorpay-Signature header");

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ApiError(400, "Invalid Razorpay webhook signature");
  }
}
