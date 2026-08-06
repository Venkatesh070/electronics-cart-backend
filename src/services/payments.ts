import { IOrder } from "../models/Order";
import {
  getRazorpay,
  isOnlinePaymentMethod,
  isRazorpayConfigured,
  toPaise,
} from "../config/razorpay";

export type RefundResult = {
  refunded: boolean;
  refundId?: string;
  skipped?: string;
  error?: string;
  amountInr?: number;
};

/**
 * Refund via Razorpay when the order was paid online.
 * Pass `amountInr` for partial refunds (returns). Full-order cancel omits it.
 */
export async function refundRazorpayPayment(
  order: IOrder,
  reason?: string,
  opts?: { amountInr?: number; markOrderFullyRefunded?: boolean }
): Promise<RefundResult> {
  const amountInr =
    opts?.amountInr != null && Number(opts.amountInr) > 0
      ? Math.round(Number(opts.amountInr) * 100) / 100
      : Number(order.totalAmount) || 0;

  if (amountInr <= 0) {
    return { refunded: false, skipped: "zero_amount" };
  }

  if (order.paymentStatus === "refunded" && opts?.amountInr == null) {
    return { refunded: true, refundId: order.razorpayRefundId, skipped: "already_refunded", amountInr };
  }

  if (order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") {
    return { refunded: false, skipped: "not_paid", amountInr };
  }

  const online = isOnlinePaymentMethod(order.paymentMethod) || Boolean(order.razorpayPaymentId);
  if (!online) {
    return { refunded: false, skipped: "cod_or_offline", amountInr };
  }

  if (!order.razorpayPaymentId) {
    return { refunded: false, skipped: "no_payment_id", amountInr };
  }

  const notes = {
    order_id: order._id.toString(),
    reason: String(reason || "Refund").slice(0, 200),
  };

  const markFull =
    opts?.markOrderFullyRefunded === true ||
    (opts?.amountInr == null && amountInr >= Number(order.totalAmount || 0) - 0.01);

  // Mock / test payments
  if (
    process.env.PAYMENTS_MOCK === "true" ||
    String(order.razorpayPaymentId).startsWith("pay_mock") ||
    String(order.razorpayOrderId || "").startsWith("order_mock_")
  ) {
    const refundId = `rfnd_mock_${Date.now()}`;
    if (markFull) {
      order.paymentStatus = "refunded";
      order.razorpayRefundId = refundId;
      order.refundedAt = new Date();
    }
    return { refunded: true, refundId, amountInr };
  }

  if (!isRazorpayConfigured()) {
    return { refunded: false, error: "Razorpay is not configured", amountInr };
  }

  try {
    const razorpay = getRazorpay();
    const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
      amount: toPaise(amountInr),
      notes,
      speed: "normal",
    });

    const refundId = refund?.id || refund?.entity?.id || String(refund?.id || "");
    if (markFull) {
      order.paymentStatus = "refunded";
      order.razorpayRefundId = refundId;
      order.refundedAt = new Date();
    }
    return { refunded: true, refundId, amountInr };
  } catch (err: unknown) {
    const message =
      (err as { error?: { description?: string }; message?: string })?.error?.description ||
      (err as { message?: string })?.message ||
      "Razorpay refund failed";
    if (/already\s*(fully\s*)?refund|refund.*processed/i.test(String(message))) {
      if (markFull) {
        order.paymentStatus = "refunded";
        order.refundedAt = order.refundedAt || new Date();
      }
      return { refunded: true, skipped: "already_refunded", error: String(message), amountInr };
    }
    return { refunded: false, error: String(message), amountInr };
  }
}
