import { IOrder } from "../models/Order";
import { User } from "../models/User";
import { Product } from "../models/Product";

const BASE = "https://apiv2.shiprocket.in/v1/external";
const HIGH_VALUE = 50_000;

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function isShiprocketConfigured(): boolean {
  return Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD);
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

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  return { first: parts[0] || "Customer", last: parts.slice(1).join(" ") || parts[0] || "Customer" };
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

export type ShiprocketCreateResult = {
  orderId: string | number;
  shipmentId?: number;
  awb?: string;
  courier?: string;
  status?: string;
};

/** Create a Shiprocket adhoc order from our shop order. */
export async function createShiprocketOrder(order: IOrder): Promise<ShiprocketCreateResult> {
  if (process.env.SHIPPING_MOCK === "true") {
    const awb = `MOCK${Date.now().toString().slice(-10)}`;
    return { orderId: `mock_${order._id}`, shipmentId: 0, awb, courier: "Mock Courier", status: "NEW" };
  }
  if (!isShiprocketConfigured()) throw new Error("Shiprocket is not configured");

  const user = await User.findById(order.user).select("email phone name");
  const addr = order.shippingAddress as IOrder["shippingAddress"] & { phone?: string; line2?: string };
  const phone = digitsPhone(addr.phone || user?.phone);
  if (!phone || phone.length < 10) {
    throw new Error("Shipping phone is required for Shiprocket (10 digits)");
  }

  const { first, last } = splitName(addr.fullName || user?.name || "Customer");
  const isCod = String(order.paymentMethod || "").toUpperCase() === "COD";
  const qty = order.items.reduce((n, i) => n + i.quantity, 0);
  // Laptop-ish defaults (was 0.5kg / 10cm — triggers bad rates & e-way issues)
  const weight = Math.max(2.5, qty * 2.5);
  const length = Number(process.env.SHIPROCKET_BOX_LENGTH) || 45;
  const breadth = Number(process.env.SHIPROCKET_BOX_BREADTH) || 35;
  const height = Number(process.env.SHIPROCKET_BOX_HEIGHT) || 12;

  const defaultGst = Number(process.env.SHIPROCKET_GST_RATE) || 18;
  const defaultHsn = process.env.SHIPROCKET_DEFAULT_HSN || "84713000";
  const pickupState = process.env.SHIPROCKET_PICKUP_STATE || addr.state || "Telangana";
  const sellerGstin = (process.env.SHIPROCKET_GSTIN || "").trim();

  if (order.totalAmount >= HIGH_VALUE && !sellerGstin) {
    throw new Error(
      "Orders over ₹50,000 need seller GSTIN. Set SHIPROCKET_GSTIN in backend .env (like Flipkart tax invoices)."
    );
  }

  const products = await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).select(
    "tax name"
  );
  const taxById = new Map(products.map((p) => [p._id.toString(), Number(p.tax) || 0]));

  const order_items = order.items.map((item) => {
    const productTax = taxById.get(item.product.toString());
    const rate = productTax && productTax > 0 ? productTax : defaultGst;
    const split = gstSplit(rate, pickupState, addr.state);
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

  const payload: Record<string, unknown> = {
    order_id: order._id.toString(),
    order_date: (order.createdAt || new Date()).toISOString().slice(0, 19).replace("T", " "),
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Primary",
    billing_customer_name: first,
    billing_last_name: last,
    billing_address: addr.line1,
    billing_address_2: addr.line2 || "",
    billing_city: addr.city,
    billing_pincode: addr.postalCode,
    billing_state: addr.state,
    billing_country: addr.country || "India",
    billing_email: user?.email || process.env.SHIPROCKET_EMAIL || "orders@example.com",
    billing_phone: phone,
    shipping_is_billing: true,
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

  if (sellerGstin) {
    payload.company_name = process.env.SHIPROCKET_COMPANY_NAME || "Electronics Cart";
    // Seller GSTIN used on tax invoice / e-way; customer_gstin only if B2B
    payload.reseller_name = payload.company_name;
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
export async function pushOrderToShiprocket(order: IOrder, opts?: { force?: boolean }): Promise<IOrder> {
  if (order.shiprocket?.orderId && !opts?.force) return order;

  const result = await createShiprocketOrder(order);
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
