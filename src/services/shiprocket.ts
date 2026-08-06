import { IOrder } from "../models/Order";
import { User } from "../models/User";
import { Product } from "../models/Product";
import { Address } from "../models/Address";
import { SystemSettings } from "../models/SystemSettings";

const BASE = "https://apiv2.shiprocket.in/v1/external";
const HIGH_VALUE = 50_000;

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function isShiprocketConfigured(): boolean {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
}

const MIN_PACKAGE_WEIGHT_KG = 2.5;
const AVG_ITEM_WEIGHT_KG = 2.5;

/** Laptop-ish per-item weight estimate — shared by order creation and rate quotes so both agree. */
export function estimateOrderWeight(qty: number): number {
  return Math.max(MIN_PACKAGE_WEIGHT_KG, qty * AVG_ITEM_WEIGHT_KG);
}

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const email = process.env.SHIPROCKET_EMAIL!;
  const password = process.env.SHIPROCKET_PASSWORD!;
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as { token?: string; message?: string };
  if (!res.ok || !body.token) {
    throw new Error(body.message || `Shiprocket login failed (${res.status})`);
  }
  tokenCache = { token: body.token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 };
  return body.token;
}

function digitsPhone(raw?: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length >= 10) return d.slice(-10);
  return d;
}

function phoneAsInt(raw?: string): number {
  return Number(digitsPhone(raw));
}

function pincodeAsInt(raw?: string): number {
  const n = Number(String(raw || "").replace(/\D/g, "").slice(0, 6));
  return Number.isFinite(n) ? n : 0;
}

function cleanAddrLine(raw?: string): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 190);
}

/** Prefer order shipping phone, then user phone, then any saved address for that user. */
async function resolveShippingPhone(order: IOrder): Promise<string> {
  const addr = order.shippingAddress as IOrder["shippingAddress"] & { phone?: string };
  let phone = digitsPhone(addr?.phone);
  if (phone.length >= 10) return phone;

  const user = await User.findById(order.user).select("phone");
  phone = digitsPhone(user?.phone);
  if (phone.length >= 10) return phone;

  const saved =
    (await Address.findOne({ user: order.user, isDefault: true }).select("phone")) ||
    (await Address.findOne({ user: order.user }).sort({ createdAt: -1 }).select("phone"));
  phone = digitsPhone(saved?.phone);
  return phone;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { first: parts[0] || "Customer", last: parts.slice(1).join(" ") || parts[0] || "Customer" };
}

type ShipCustomerAddr = {
  first: string;
  last: string;
  fullName: string;
  phone: string;
  email: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

async function resolveShipCustomer(order: IOrder): Promise<ShipCustomerAddr> {
  const user = await User.findById(order.user).select("email phone name");
  const addr = order.shippingAddress as IOrder["shippingAddress"] & { phone?: string; line2?: string };

  let phone = digitsPhone(addr.phone || user?.phone);
  if (!phone || phone.length < 10) phone = await resolveShippingPhone(order);
  if (!phone || phone.length < 10) {
    throw new Error("Shipping phone is required for Shiprocket (10 digits)");
  }

  const fullName = cleanAddrLine(addr.fullName || user?.name || "Customer") || "Customer";
  const { first, last } = splitName(fullName);
  const line1 = cleanAddrLine(addr.line1);
  if (!line1) throw new Error("Shipping address line 1 is required for Shiprocket");
  const city = cleanAddrLine(addr.city);
  const state = cleanAddrLine(addr.state);
  const postalCode = String(addr.postalCode || "").replace(/\D/g, "").slice(0, 6);
  if (!city || !state || postalCode.length !== 6) {
    throw new Error("Shipping city, state, and 6-digit pincode are required for Shiprocket");
  }

  // Persist resolved phone so later pushes / labels don't fail again
  if (!addr.phone || digitsPhone(addr.phone) !== phone) {
    order.shippingAddress = { ...order.shippingAddress, phone };
  }

  return {
    first,
    last,
    fullName,
    phone,
    email: String(user?.email || process.env.SHIPROCKET_EMAIL || "orders@example.com").trim(),
    line1,
    line2: cleanAddrLine(addr.line2),
    city,
    state,
    postalCode,
    country: cleanAddrLine(addr.country) || "India",
  };
}

/**
 * Force-set delivery name/phone/address on an existing Shiprocket order.
 * Create/adhoc sometimes drops billing when types don't match; this is the reliable fix.
 */
export async function updateShiprocketCustomerAddress(
  shiprocketOrderId: string | number,
  customer: ShipCustomerAddr
): Promise<void> {
  if (process.env.SHIPPING_MOCK === "true") return;

  const payload = {
    order_id: Number(shiprocketOrderId) || shiprocketOrderId,
    shipping_customer_name: customer.fullName,
    shipping_phone: phoneAsInt(customer.phone),
    shipping_address: customer.line1,
    shipping_address_2: customer.line2 || "",
    shipping_city: customer.city,
    shipping_state: customer.state,
    shipping_country: customer.country,
    shipping_pincode: pincodeAsInt(customer.postalCode),
    shipping_email: customer.email,
  };

  const token = await getToken();
  const res = await fetch(`${BASE}/orders/address/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  // Shiprocket often returns 202 with an empty body
  if (!res.ok && res.status !== 202) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(msg || `Shiprocket address update failed (${res.status})`);
  }
}

function normState(s?: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** GST split like Flipkart invoices: same-state → CGST+SGST, else IGST. */
function gstSplit(ratePercent: number, pickupState: string, deliveryState: string) {
  const rate = Math.max(0, Number(ratePercent) || 0);
  const sameState = normState(pickupState) && normState(pickupState) === normState(deliveryState);
  if (sameState) {
    const half = Math.round((rate / 2) * 100) / 100;
    return { tax: rate, cgst: half, sgst: half, igst: 0 };
  }
  return { tax: rate, cgst: 0, sgst: 0, igst: rate };
}

async function resolveSellerGstin(override?: string): Promise<string> {
  const fromOverride = String(override || "").trim().toUpperCase();
  if (fromOverride) return fromOverride;

  const fromEnv = String(process.env.SHIPROCKET_GSTIN || "").trim().toUpperCase();
  if (fromEnv) return fromEnv;

  const settings = await SystemSettings.findOne().select("sellerGstin").lean();
  return String(settings?.sellerGstin || "").trim().toUpperCase();
}

export type ShiprocketCreateResult = {
  orderId: string | number;
  shipmentId?: number;
  awb?: string;
  courier?: string;
  status?: string;
};

/** Create a Shiprocket adhoc order from our shop order. */
export async function createShiprocketOrder(
  order: IOrder,
  opts?: { sellerGstin?: string }
): Promise<ShiprocketCreateResult> {
  if (process.env.SHIPPING_MOCK === "true") {
    const awb = `MOCK${Date.now().toString().slice(-10)}`;
    return { orderId: `mock_${order._id}`, shipmentId: 0, awb, courier: "Mock Courier", status: "NEW" };
  }
  if (!isShiprocketConfigured()) throw new Error("Shiprocket is not configured");

  const customer = await resolveShipCustomer(order);
  const isCod = String(order.paymentMethod || "").toUpperCase() === "COD";
  const qty = order.items.reduce((n, i) => n + i.quantity, 0);
  // Laptop-ish defaults (was 0.5kg / 10cm — triggers bad rates & e-way issues)
  const weight = estimateOrderWeight(qty);
  const length = Number(process.env.SHIPROCKET_BOX_LENGTH) || 45;
  const breadth = Number(process.env.SHIPROCKET_BOX_BREADTH) || 35;
  const height = Number(process.env.SHIPROCKET_BOX_HEIGHT) || 12;

  const defaultGst = Number(process.env.SHIPROCKET_GST_RATE) || 18;
  const defaultHsn = process.env.SHIPROCKET_DEFAULT_HSN || "84713000";
  const pickupState = process.env.SHIPROCKET_PICKUP_STATE || customer.state || "Telangana";
  const sellerGstin = await resolveSellerGstin(opts?.sellerGstin);

  if (order.totalAmount >= HIGH_VALUE && !sellerGstin) {
    throw new Error(
      "Orders over ₹50,000 need seller GSTIN. Add it in System Settings (or SHIPROCKET_GSTIN in .env), or enter it when pushing to Shiprocket."
    );
  }

  const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).select(
    "tax name"
  );
  const taxById = new Map(products.map((p) => [p._id.toString(), Number(p.tax) || 0]));

  const order_items = order.items.map((item) => {
    const productTax = taxById.get(item.product.toString());
    const rate = productTax && productTax > 0 ? productTax : defaultGst;
    const split = gstSplit(rate, pickupState, customer.state);
    return {
      name: item.name,
      sku: item.product.toString().slice(-12),
      units: item.quantity,
      selling_price: item.price,
      // Inclusive GST % + HSN — required for Shiprocket invoices / >₹50k
      tax: split.tax,
      hsn: defaultHsn,
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
    };
  });

  const ewaybill =
    order.shiprocket?.ewaybillNo ||
    process.env.SHIPROCKET_EWAYBILL_NO ||
    undefined;

  const phone = phoneAsInt(customer.phone);
  const pin = pincodeAsInt(customer.postalCode);

  // Shiprocket expects integers for phone/pincode and 1/0 for shipping_is_billing.
  // Always mirror shipping_* even when same as billing — create/adhoc often drops billing otherwise.
  const payload: Record<string, unknown> = {
    order_id: order._id.toString(),
    order_date: (order.createdAt || new Date()).toISOString().slice(0, 19).replace("T", " "),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Primary",
    billing_customer_name: customer.first,
    billing_last_name: customer.last,
    billing_address: customer.line1,
    billing_address_2: customer.line2 || "",
    billing_city: customer.city,
    billing_pincode: pin,
    billing_state: customer.state,
    billing_country: customer.country,
    billing_email: customer.email,
    billing_phone: phone,
    billing_isd_code: "91",
    shipping_is_billing: 1,
    shipping_customer_name: customer.first,
    shipping_last_name: customer.last,
    shipping_address: customer.line1,
    shipping_address_2: customer.line2 || "",
    shipping_city: customer.city,
    shipping_pincode: pin,
    shipping_state: customer.state,
    shipping_country: customer.country,
    shipping_email: customer.email,
    shipping_phone: phone,
    order_items,
    payment_method: isCod ? "COD" : "Prepaid",
    sub_total: order.totalAmount,
    shipping_charges: order.shippingFee || 0,
    total_discount: order.discount || 0,
    length,
    breadth,
    height,
    weight,
  };

  // reseller_name = label "From" text. Do NOT set company_name (that is the buyer's company on the invoice).
  const reseller = String(process.env.SHIPROCKET_COMPANY_NAME || "").trim();
  if (reseller) {
    payload.reseller_name = reseller.startsWith("Reseller:") ? reseller : `Reseller: ${reseller}`;
  }
  if (order.shiprocket?.customerGstin) {
    payload.customer_gstin = order.shiprocket.customerGstin;
  }
  if (ewaybill) {
    payload.ewaybill_no = ewaybill;
  }

  const token = await getToken();
  const res = await fetch(`${BASE}/orders/create/adhoc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    order_id?: number | string;
    shipment_id?: number;
    awb_code?: string | null;
    courier_name?: string | null;
    status?: string;
    message?: string | string[];
  };

  if (!res.ok || body.order_id == null) {
    const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(msg || `Shiprocket create order failed (${res.status})`);
  }

  // Ensure Delivered-To name/phone/address stick (create/adhoc can leave billing blank).
  try {
    await updateShiprocketCustomerAddress(body.order_id, customer);
  } catch (err) {
    console.warn(
      "[shiprocket] address update after create failed:",
      err instanceof Error ? err.message : err
    );
  }

  return {
    orderId: body.order_id,
    shipmentId: body.shipment_id,
    awb: body.awb_code || undefined,
    courier: body.courier_name || undefined,
    status: body.status,
  };
}

function applyShiprocketFields(
  order: IOrder,
  fields: {
    orderId?: string;
    shipmentId?: string;
    awb?: string;
    courier?: string;
    status?: string;
    labelUrl?: string;
    invoiceUrl?: string;
  }
) {
  const next = { ...(order.shiprocket || {}) };
  if (fields.orderId != null) next.orderId = fields.orderId;
  if (fields.shipmentId != null) next.shipmentId = fields.shipmentId;
  if (fields.awb != null) next.awb = fields.awb;
  if (fields.status != null) next.status = fields.status;
  if (fields.labelUrl != null) next.labelUrl = fields.labelUrl;
  if (fields.invoiceUrl != null) next.invoiceUrl = fields.invoiceUrl;
  if (!next.pushedAt) next.pushedAt = new Date();
  order.shiprocket = next;
  if (fields.awb) {
    order.tracking = {
      courier: fields.courier || order.tracking?.courier || "Shiprocket",
      trackingId: fields.awb,
      url: `https://shiprocket.co/tracking/${fields.awb}`,
    };
  }
}

/** Push order to Shiprocket and persist IDs / AWB on the order doc. Idempotent. */
export async function pushOrderToShiprocket(
  order: IOrder,
  opts?: { force?: boolean; sellerGstin?: string }
): Promise<IOrder> {
  // Already on Shiprocket: refresh customer delivery details instead of recreating.
  if (order.shiprocket?.orderId && !opts?.force) {
    try {
      const customer = await resolveShipCustomer(order);
      await updateShiprocketCustomerAddress(order.shiprocket.orderId, customer);
      await order.save();
    } catch (err) {
      console.warn(
        "[shiprocket] address sync on existing order failed:",
        err instanceof Error ? err.message : err
      );
    }
    return order;
  }

  const result = await createShiprocketOrder(order, { sellerGstin: opts?.sellerGstin });
  applyShiprocketFields(order, {
    orderId: String(result.orderId),
    shipmentId: result.shipmentId != null ? String(result.shipmentId) : undefined,
    awb: result.awb,
    courier: result.courier,
    status: result.status || "NEW",
  });
  if (!result.awb && !order.tracking?.trackingId) {
    order.tracking = { courier: "Shiprocket", trackingId: undefined, url: undefined };
  }
  await order.save();
  return order;
}

async function srFetch(path: string, init?: RequestInit) {
  if (process.env.SHIPPING_MOCK === "true") {
    throw new Error("Shiprocket mock mode — no live documents");
  }
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = body.message;
    throw new Error(
      (Array.isArray(msg) ? msg.join(", ") : typeof msg === "string" ? msg : null) ||
        `Shiprocket ${path} failed (${res.status})`
    );
  }
  return body;
}

/** Pull latest AWB / shipment_id from Shiprocket after seller clicks Ship Now. */
export async function syncShiprocketOrder(order: IOrder): Promise<IOrder> {
  const srOrderId = order.shiprocket?.orderId;
  if (!srOrderId) throw new Error("Order is not on Shiprocket yet");
  if (process.env.SHIPPING_MOCK === "true") return order;

  const body = await srFetch(`/orders/show/${srOrderId}`);
  const data = (body.data || body) as {
    status?: string;
    shipments?: { id?: number; awb?: string; courier?: string }[];
    awb_data?: { awb?: string; courier_name?: string };
  };
  const shipment = data.shipments?.[0];
  const awb = shipment?.awb || data.awb_data?.awb || order.shiprocket?.awb;
  const shipmentId = shipment?.id != null ? String(shipment.id) : order.shiprocket?.shipmentId;
  const courier = shipment?.courier || data.awb_data?.courier_name;

  applyShiprocketFields(order, {
    shipmentId,
    awb: awb || undefined,
    courier: courier || undefined,
    status: data.status || order.shiprocket?.status,
  });
  await order.save();
  return order;
}

/** Generate shipping label PDF URL (needs AWB assigned via Ship Now first). */
export async function getShiprocketLabelUrl(order: IOrder): Promise<string> {
  if (order.shiprocket?.labelUrl) return order.shiprocket.labelUrl;
  if (process.env.SHIPPING_MOCK === "true") {
    const url = `https://example.com/mock-label-${order._id}.pdf`;
    applyShiprocketFields(order, { labelUrl: url, awb: order.shiprocket?.awb || "MOCK" });
    await order.save();
    return url;
  }

  await syncShiprocketOrder(order);
  const shipmentId = order.shiprocket?.shipmentId;
  if (!shipmentId) throw new Error("No Shiprocket shipment yet — click Ship Now in Shiprocket first");
  if (!order.shiprocket?.awb) {
    throw new Error("AWB not assigned yet — complete Ship Now in Shiprocket, then try again");
  }

  const body = await srFetch("/courier/generate/label", {
    method: "POST",
    body: JSON.stringify({ shipment_id: [Number(shipmentId)] }),
  });
  const labelUrl = String(body.label_url || (body as { label_url?: string }).label_url || "");
  if (!labelUrl) throw new Error("Shiprocket did not return a label URL");

  applyShiprocketFields(order, { labelUrl });
  await order.save();
  return labelUrl;
}

type PickupCache = {
  pincode: string;
  expiresAt: number;
  address?: WarehouseAddress;
};
let pickupCache: PickupCache | null = null;

export type WarehouseAddress = {
  name: string;
  phone: string;
  email: string;
  address: string;
  address2?: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
};

/** Resolve seller warehouse (Shiprocket pickup location) for reverse return delivery. */
export async function getWarehouseAddress(): Promise<WarehouseAddress> {
  const envAddr: WarehouseAddress = {
    name: process.env.SHIPROCKET_RETURN_NAME || process.env.SHIPROCKET_COMPANY_NAME || "Electronics Cart",
    phone: digitsPhone(process.env.SHIPROCKET_RETURN_PHONE || process.env.SHIPROCKET_PICKUP_PHONE || ""),
    email: process.env.SHIPROCKET_RETURN_EMAIL || process.env.SHIPROCKET_EMAIL || "returns@example.com",
    address: process.env.SHIPROCKET_RETURN_ADDRESS || "",
    address2: process.env.SHIPROCKET_RETURN_ADDRESS_2 || "",
    city: process.env.SHIPROCKET_RETURN_CITY || "",
    state: process.env.SHIPROCKET_RETURN_STATE || process.env.SHIPROCKET_PICKUP_STATE || "Telangana",
    country: process.env.SHIPROCKET_RETURN_COUNTRY || "India",
    pincode: String(process.env.SHIPROCKET_RETURN_PINCODE || process.env.SHIPROCKET_PICKUP_PINCODE || "").trim(),
  };

  if (envAddr.address && envAddr.city && envAddr.pincode && envAddr.phone.length >= 10) {
    return envAddr;
  }

  if (process.env.SHIPPING_MOCK === "true") {
    return {
      name: envAddr.name,
      phone: envAddr.phone.length >= 10 ? envAddr.phone : "9999999999",
      email: envAddr.email,
      address: envAddr.address || "Warehouse Primary",
      address2: envAddr.address2,
      city: envAddr.city || "Hyderabad",
      state: envAddr.state,
      country: envAddr.country,
      pincode: envAddr.pincode || "500001",
    };
  }

  if (pickupCache?.address && pickupCache.expiresAt > Date.now()) {
    return { ...pickupCache.address, ...pickDefined(envAddr) };
  }

  const body = await srFetch("/settings/company/pickup");
  type SrAddr = {
    pickup_location?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    address_2?: string;
    city?: string;
    state?: string;
    country?: string;
    pin_code?: string;
  };
  const addresses =
    ((body.data as { shipping_address?: SrAddr[] } | undefined)?.shipping_address) || [];
  const wanted = (process.env.SHIPROCKET_PICKUP_LOCATION || "Primary").toLowerCase();
  const match =
    addresses.find((a) => String(a.pickup_location || "").toLowerCase() === wanted) || addresses[0];
  if (!match?.pin_code) throw new Error("Could not resolve Shiprocket warehouse address for returns");

  const resolved: WarehouseAddress = {
    name: envAddr.name || match.name || "Electronics Cart",
    phone: envAddr.phone.length >= 10 ? envAddr.phone : digitsPhone(match.phone),
    email: envAddr.email || match.email || process.env.SHIPROCKET_EMAIL || "returns@example.com",
    address: envAddr.address || match.address || "Warehouse",
    address2: envAddr.address2 || match.address_2 || "",
    city: envAddr.city || match.city || "",
    state: envAddr.state || match.state || "Telangana",
    country: envAddr.country || match.country || "India",
    pincode: envAddr.pincode || String(match.pin_code),
  };
  if (!resolved.phone || resolved.phone.length < 10) {
    throw new Error("Warehouse phone is required for Shiprocket returns (set SHIPROCKET_RETURN_PHONE)");
  }

  pickupCache = { pincode: resolved.pincode, address: resolved, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return resolved;
}

function pickDefined(addr: WarehouseAddress): Partial<WarehouseAddress> {
  const out: Partial<WarehouseAddress> = {};
  (Object.keys(addr) as (keyof WarehouseAddress)[]).forEach((k) => {
    const v = addr[k];
    if (v) (out as Record<string, string>)[k] = String(v);
  });
  return out;
}

/** Resolve the pickup location's pincode (env override, else looked up from Shiprocket & cached). */
async function getPickupPincode(): Promise<string> {
  const override = process.env.SHIPROCKET_PICKUP_PINCODE;
  if (override) return override.trim();
  if (pickupCache && pickupCache.expiresAt > Date.now()) return pickupCache.pincode;

  const warehouse = await getWarehouseAddress();
  return warehouse.pincode;
}

export type ShiprocketCourierOption = {
  courierId: number;
  courierName: string;
  rate: number;
  codAvailable: boolean;
  estimatedDays?: number;
  etd?: string;
};

/** Live courier serviceability + rates for a delivery pincode (Shiprocket's rate-check API). */
export async function getServiceableCouriers(
  deliveryPincode: string,
  weight: number,
  cod: boolean
): Promise<ShiprocketCourierOption[]> {
  if (!isShiprocketConfigured()) throw new Error("Shiprocket is not configured");
  if (process.env.SHIPPING_MOCK === "true") {
    return [
      { courierId: -1, courierName: "Mock Standard Courier", rate: 99, codAvailable: true, estimatedDays: 5 },
      { courierId: -2, courierName: "Mock Express Courier", rate: 149, codAvailable: true, estimatedDays: 2 },
    ];
  }

  const pickupPincode = await getPickupPincode();
  const params = new URLSearchParams({
    pickup_postcode: pickupPincode,
    delivery_postcode: String(deliveryPincode),
    weight: String(weight),
    cod: cod ? "1" : "0",
  });
  const body = await srFetch(`/courier/serviceability/?${params.toString()}`);
  const list =
    ((body.data as { available_courier_companies?: Array<Record<string, unknown>> } | undefined)
      ?.available_courier_companies) || [];

  return list
    .map((c) => ({
      courierId: Number(c.courier_company_id),
      courierName: String(c.courier_name || "Courier"),
      rate: Math.round(Number(c.rate ?? c.freight_charge ?? 0)),
      codAvailable: Number(c.cod) === 1,
      estimatedDays:
        c.estimated_delivery_days != null && !Number.isNaN(Number(c.estimated_delivery_days))
          ? Number(c.estimated_delivery_days)
          : undefined,
      etd: typeof c.etd === "string" ? c.etd : undefined,
    }))
    .filter((c) => c.rate > 0)
    .sort((a, b) => a.rate - b.rate);
}

export type DeliverySlotQuote = {
  slot: "standard" | "express";
  label: string;
  courierName: string;
  rate: number;
  estimatedDays?: number;
  etd?: string;
};

/**
 * Derives the two checkout-facing options from live courier rates: cheapest → Standard,
 * fastest ETA → Express (deduped if the same courier wins both).
 */
export async function getCheckoutDeliveryOptions(
  deliveryPincode: string,
  qty: number,
  cod: boolean
): Promise<DeliverySlotQuote[]> {
  const weight = estimateOrderWeight(qty);
  const couriers = await getServiceableCouriers(deliveryPincode, weight, cod);
  if (!couriers.length) throw new Error("No couriers currently serviceable for this pincode");

  const cheapest = couriers[0];
  const fastest = [...couriers].sort((a, b) => {
    const ad = a.estimatedDays ?? 99;
    const bd = b.estimatedDays ?? 99;
    return ad !== bd ? ad - bd : a.rate - b.rate;
  })[0];

  const options: DeliverySlotQuote[] = [
    {
      slot: "standard",
      label: "Standard delivery",
      courierName: cheapest.courierName,
      rate: cheapest.rate,
      estimatedDays: cheapest.estimatedDays,
      etd: cheapest.etd,
    },
  ];
  if (fastest && fastest.courierId !== cheapest.courierId) {
    options.push({
      slot: "express",
      label: "Express delivery",
      courierName: fastest.courierName,
      rate: fastest.rate,
      estimatedDays: fastest.estimatedDays,
      etd: fastest.etd,
    });
  }
  return options;
}

/** Generate Shiprocket tax/shipping invoice PDF URL. */
export async function getShiprocketInvoiceUrl(order: IOrder): Promise<string> {
  if (order.shiprocket?.invoiceUrl) return order.shiprocket.invoiceUrl;
  if (process.env.SHIPPING_MOCK === "true") {
    const url = `https://example.com/mock-invoice-${order._id}.pdf`;
    applyShiprocketFields(order, { invoiceUrl: url });
    await order.save();
    return url;
  }

  const srOrderId = order.shiprocket?.orderId;
  if (!srOrderId) throw new Error("Order is not on Shiprocket yet");

  const body = await srFetch("/orders/print/invoice", {
    method: "POST",
    body: JSON.stringify({ ids: [Number(srOrderId)] }),
  });
  const invoiceUrl = String(body.invoice_url || "");
  if (!invoiceUrl) throw new Error("Shiprocket did not return an invoice URL");

  applyShiprocketFields(order, { invoiceUrl });
  await order.save();
  return invoiceUrl;
}

export type ShiprocketCancelResult = {
  cancelled: boolean;
  skipped?: string;
  error?: string;
};

/**
 * Cancel a Shiprocket order/shipment if one was created for this shop order.
 * Safe to call when Shiprocket was never used — returns skipped.
 */
export async function cancelShiprocketOrder(order: IOrder): Promise<ShiprocketCancelResult> {
  const srOrderId = order.shiprocket?.orderId;
  if (!srOrderId) return { cancelled: false, skipped: "not_on_shiprocket" };

  const already = String(order.shiprocket?.status || "").toUpperCase();
  if (already.includes("CANCEL")) {
    return { cancelled: true, skipped: "already_cancelled" };
  }

  if (process.env.SHIPPING_MOCK === "true" || String(srOrderId).startsWith("mock_")) {
    applyShiprocketFields(order, { status: "CANCELED" });
    return { cancelled: true };
  }

  if (!isShiprocketConfigured()) {
    return { cancelled: false, skipped: "not_configured" };
  }

  const numericId = Number(srOrderId);
  const ids = [Number.isFinite(numericId) ? numericId : srOrderId];

  const token = await getToken();
  const res = await fetch(`${BASE}/orders/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ids }),
  });

  // Shiprocket often returns 204 No Content on success
  if (res.status === 204 || res.ok) {
    applyShiprocketFields(order, { status: "CANCELED" });
    return { cancelled: true };
  }

  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
  // Treat "already cancelled" style errors as success
  if (/already\s*cancel|cancelled|canceled/i.test(String(msg || ""))) {
    applyShiprocketFields(order, { status: "CANCELED" });
    return { cancelled: true, skipped: "already_cancelled" };
  }

  return { cancelled: false, error: msg || `Shiprocket cancel failed (${res.status})` };
}

export type ShiprocketReturnResult = {
  orderId: string;
  shipmentId?: string;
  awb?: string;
  courier?: string;
  status?: string;
  trackingUrl?: string;
};

/**
 * Create a Shiprocket reverse pickup (customer → warehouse) for an approved return.
 */
export async function createShiprocketReturnOrder(params: {
  returnId: string;
  order: IOrder;
  itemName: string;
  itemSku: string;
  quantity: number;
  unitPrice: number;
}): Promise<ShiprocketReturnResult> {
  const { returnId, order, itemName, itemSku, quantity, unitPrice } = params;
  const channelOrderId = `RET${returnId.slice(-10)}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 50);

  if (process.env.SHIPPING_MOCK === "true") {
    const awb = `RMOCK${Date.now().toString().slice(-9)}`;
    return {
      orderId: `mock_ret_${returnId}`,
      shipmentId: "0",
      awb,
      courier: "Mock Return Courier",
      status: "RETURN CREATED",
      trackingUrl: `https://shiprocket.co/tracking/${awb}`,
    };
  }
  if (!isShiprocketConfigured()) throw new Error("Shiprocket is not configured");

  const user = await User.findById(order.user).select("email phone name");
  const addr = order.shippingAddress as IOrder["shippingAddress"] & { phone?: string; line2?: string };
  let phone = digitsPhone(addr.phone || user?.phone);
  if (!phone || phone.length < 10) phone = await resolveShippingPhone(order);
  if (!phone || phone.length < 10) {
    throw new Error("Customer phone is required for return pickup (10 digits)");
  }

  const warehouse = await getWarehouseAddress();
  const { first, last } = splitName(addr.fullName || user?.name || "Customer");
  const { first: whFirst, last: whLast } = splitName(warehouse.name);
  const weight = estimateOrderWeight(quantity);
  const length = Number(process.env.SHIPROCKET_BOX_LENGTH) || 45;
  const breadth = Number(process.env.SHIPROCKET_BOX_BREADTH) || 35;
  const height = Number(process.env.SHIPROCKET_BOX_HEIGHT) || 12;
  const hsn = process.env.SHIPROCKET_DEFAULT_HSN || "84713000";
  const subTotal = Math.round(unitPrice * quantity * 100) / 100;

  const payload = {
    order_id: channelOrderId,
    order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
    channel_id: process.env.SHIPROCKET_CHANNEL_ID ? Number(process.env.SHIPROCKET_CHANNEL_ID) : undefined,
    pickup_customer_name: first,
    pickup_last_name: last,
    pickup_address: addr.line1,
    pickup_address_2: addr.line2 || "",
    pickup_city: addr.city,
    pickup_state: addr.state,
    pickup_country: addr.country || "India",
    pickup_pincode: pincodeAsInt(addr.postalCode),
    pickup_email: user?.email || process.env.SHIPROCKET_EMAIL || "customer@example.com",
    pickup_phone: phoneAsInt(phone),
    pickup_isd_code: "91",
    shipping_customer_name: whFirst,
    shipping_last_name: whLast,
    shipping_address: warehouse.address,
    shipping_address_2: warehouse.address2 || "",
    shipping_city: warehouse.city,
    shipping_state: warehouse.state,
    shipping_country: warehouse.country,
    shipping_pincode: pincodeAsInt(warehouse.pincode),
    shipping_email: warehouse.email,
    shipping_phone: phoneAsInt(warehouse.phone),
    shipping_isd_code: "91",
    order_items: [
      {
        name: itemName,
        sku: String(itemSku).slice(0, 50) || returnId.slice(-12),
        units: quantity,
        selling_price: unitPrice,
        discount: 0,
        hsn,
      },
    ],
    payment_method: "Prepaid",
    sub_total: subTotal,
    length,
    breadth,
    height,
    weight,
  };

  // Remove undefined channel_id if not set
  if (payload.channel_id == null) delete (payload as { channel_id?: number }).channel_id;

  const token = await getToken();
  const res = await fetch(`${BASE}/orders/create/return`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    order_id?: string | number;
    shipment_id?: string | number;
    awb_code?: string | null;
    courier_name?: string | null;
    status?: string;
    message?: string | string[];
  };

  if (!res.ok || body.order_id == null) {
    const msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(msg || `Shiprocket return create failed (${res.status})`);
  }

  const awb = body.awb_code || undefined;
  return {
    orderId: String(body.order_id),
    shipmentId: body.shipment_id != null ? String(body.shipment_id) : undefined,
    awb,
    courier: body.courier_name || undefined,
    status: body.status || "RETURN CREATED",
    trackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : undefined,
  };
}

/** Pull latest AWB / status for a Shiprocket return order. */
export async function syncShiprocketReturnOrder(srOrderId: string): Promise<{
  awb?: string;
  shipmentId?: string;
  status?: string;
  courier?: string;
  trackingUrl?: string;
}> {
  if (process.env.SHIPPING_MOCK === "true" || String(srOrderId).startsWith("mock_")) {
    return {
      awb: `RMOCK${String(srOrderId).slice(-8)}`,
      status: "DELIVERED",
      courier: "Mock Return Courier",
      trackingUrl: `https://shiprocket.co/tracking/RMOCK${String(srOrderId).slice(-8)}`,
    };
  }

  const body = await srFetch(`/orders/show/${srOrderId}`);
  const data = (body.data || body) as Record<string, unknown>;
  const shipments = (data.shipments as Array<Record<string, unknown>> | undefined) || [];
  const shipment = shipments[0] || {};
  const awb = String(shipment.awb || data.awb_data && (data.awb_data as { awb?: string }).awb || "") || undefined;
  const status = String(shipment.status || data.status || "") || undefined;
  const courier = String(shipment.courier || shipment.courier_name || data.courier_name || "") || undefined;
  const shipmentId =
    shipment.id != null ? String(shipment.id) : data.shipment_id != null ? String(data.shipment_id) : undefined;

  return {
    awb,
    shipmentId,
    status,
    courier,
    trackingUrl: awb ? `https://shiprocket.co/tracking/${awb}` : undefined,
  };
}

/** Classify Shiprocket return tracking status for our return workflow. */
export function classifyReturnShipStatus(status?: string): "in_transit" | "picked_up" | "received" | "unknown" {
  const s = String(status || "").toUpperCase();
  if (!s) return "unknown";
  if (
    /DELIVERED|RETURNED TO SELLER|RTO DELIVERED|REACHED DESTINATION|DELIVERED TO SELLER|RETURN DELIVERED/.test(s)
  ) {
    return "received";
  }
  if (/PICKED UP|PICKUP COMPLETE|IN TRANSIT|SHIPPED|OUT FOR DELIVERY|OFD/.test(s)) {
    return "picked_up";
  }
  return "in_transit";
}
