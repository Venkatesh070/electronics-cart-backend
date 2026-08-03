import { Notification, NotificationType } from "../models/Notification";
import { User, STAFF_ROLES } from "../models/User";

const PREFERENCE_KEY: Partial<Record<NotificationType, string>> = {
  order_update: "orderUpdates",
  price_drop: "priceDrops",
  promotion: "promotions",
  support_reply: "supportReplies",
};

/** Creates a notification if the user has that category enabled. Never throws. */
export async function notifyUser(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  relatedId?: string
) {
  try {
    const prefKey = PREFERENCE_KEY[type];
    if (prefKey) {
      const user = await User.findById(userId).select("notificationPreferences");
      if (user && !user.notificationPreferences[prefKey as keyof typeof user.notificationPreferences]) {
        return;
      }
    }
    await Notification.create({ user: userId, type, title, message, relatedId });
  } catch {
    // Notifications must never break the primary request.
  }
}

/** Broadcasts a system alert (low stock, failed payment, new ticket, ...) to all staff accounts. */
export async function notifyStaff(title: string, message: string, relatedId?: string) {
  try {
    const staff = await User.find({ role: { $in: STAFF_ROLES } }).select("_id");
    await Notification.insertMany(
      staff.map((s) => ({ user: s._id, type: "system_alert", title, message, relatedId }))
    );
  } catch {
    // Notifications must never break the primary request.
  }
}
