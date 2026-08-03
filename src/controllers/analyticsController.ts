import { Request, Response } from "express";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { Review } from "../models/Review";
import { Return } from "../models/Return";
import { Ticket } from "../models/Ticket";
import { SearchLog } from "../models/SearchLog";
import { asyncHandler } from "../utils/asyncHandler";

function dateRange(from?: string, to?: string) {
  const match: Record<string, Date> = {};
  if (from) match.$gte = new Date(from);
  if (to) match.$lte = new Date(to);
  return Object.keys(match).length ? match : undefined;
}

/** Admin dashboard KPIs + chart aggregates. */
export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = req.query as Record<string, string>;
  const createdAt = dateRange(from, to);
  const orderMatch: Record<string, unknown> = { status: { $ne: "cancelled" } };
  if (createdAt) orderMatch.createdAt = createdAt;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const customerMatch: Record<string, unknown> = { role: "customer" };
  if (createdAt) customerMatch.createdAt = createdAt;
  else customerMatch.createdAt = { $gte: thirtyDaysAgo };

  const [
    revenueAgg,
    ordersByStatus,
    salesByBrand,
    newCustomers,
    lowStockCount,
    recentOrders,
    lowStockProducts,
    openTickets,
    pendingReturns,
  ] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
          productsSold: { $sum: { $sum: "$items.quantity" } },
        },
      },
    ]),
    Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: orderMatch },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "brands",
          localField: "product.brand",
          foreignField: "_id",
          as: "brand",
        },
      },
      { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$brand.name",
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          units: { $sum: "$items.quantity" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
    User.countDocuments(customerMatch),
    Product.countDocuments({
      $expr: { $lte: ["$stock", "$minStock"] },
      status: { $ne: "INACTIVE" },
    }),
    Order.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(10),
    Product.find({
      $expr: { $lte: ["$stock", "$minStock"] },
      status: { $ne: "INACTIVE" },
    })
      .select("name stock minStock")
      .sort({ stock: 1 })
      .limit(10),
    Ticket.countDocuments({ status: { $in: ["open", "pending"] } }),
    Return.countDocuments({ status: { $in: ["requested", "approved", "picked_up", "inspected"] } }),
  ]);

  const stats = revenueAgg[0] || { revenue: 0, orders: 0, productsSold: 0 };
  const aov = stats.orders > 0 ? stats.revenue / stats.orders : 0;

  const trendMatch: Record<string, unknown> = { status: { $ne: "cancelled" } };
  if (createdAt) trendMatch.createdAt = createdAt;
  else trendMatch.createdAt = { $gte: thirtyDaysAgo };

  const trend = await Order.aggregate([
    { $match: trendMatch },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$totalAmount" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    success: true,
    data: {
      kpis: {
        revenue: stats.revenue,
        orders: stats.orders,
        aov,
        newCustomers,
        productsSold: stats.productsSold,
        lowStock: lowStockCount,
        openTickets,
        pendingReturns,
      },
      trend,
      ordersByStatus,
      salesByBrand,
      recentOrders,
      lowStockAlerts: lowStockProducts,
    },
  });
});

/** Sales / inventory / customer / tax report exports (JSON; frontends can CSV). */
export const getReports = asyncHandler(async (req: Request, res: Response) => {
  const { type = "sales", from, to } = req.query as Record<string, string>;
  const createdAt = dateRange(from, to);

  if (type === "sales") {
    const match: Record<string, unknown> = { status: { $ne: "cancelled" } };
    if (createdAt) match.createdAt = createdAt;
    const rows = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
          tax: { $sum: "$tax" },
          shipping: { $sum: "$shippingFee" },
          discount: { $sum: "$discount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return res.json({ success: true, data: { type, rows } });
  }

  if (type === "inventory") {
    const rows = await Product.find({ status: { $ne: "INACTIVE" } })
      .select("name stock minStock status price variants sku")
      .populate("category", "name")
      .populate("brand", "name")
      .sort({ stock: 1 });
    return res.json({ success: true, data: { type, rows } });
  }

  if (type === "customers") {
    const match: Record<string, unknown> = { role: "customer" };
    if (createdAt) match.createdAt = createdAt;
    const customers = await User.find(match).select("name email phone createdAt isBlocked");
    const spend = await Order.aggregate([
      { $match: { user: { $in: customers.map((c) => c._id) }, status: { $ne: "cancelled" } } },
      { $group: { _id: "$user", orderCount: { $sum: 1 }, totalSpend: { $sum: "$totalAmount" } } },
    ]);
    const map = new Map(spend.map((s) => [s._id.toString(), s]));
    const rows = customers.map((c) => ({
      ...c.toObject(),
      orderCount: map.get(c._id.toString())?.orderCount || 0,
      totalSpend: map.get(c._id.toString())?.totalSpend || 0,
    }));
    return res.json({ success: true, data: { type, rows } });
  }

  if (type === "tax") {
    const match: Record<string, unknown> = { status: { $ne: "cancelled" } };
    if (createdAt) match.createdAt = createdAt;
    const rows = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$shippingAddress.state",
          taxableOrders: { $sum: 1 },
          taxCollected: { $sum: "$tax" },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { taxCollected: -1 } },
    ]);
    return res.json({ success: true, data: { type, rows } });
  }

  res.status(400).json({ success: false, message: "type must be sales|inventory|customers|tax" });
});

/** Traffic / conversion / top products analytics. */
export const getAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = req.query as Record<string, string>;
  const createdAt = dateRange(from, to);
  const orderMatch: Record<string, unknown> = { status: { $ne: "cancelled" } };
  if (createdAt) orderMatch.createdAt = createdAt;

  const searchMatch: Record<string, unknown> = {};
  if (createdAt) searchMatch.createdAt = createdAt;

  const [topProducts, topCategories, searchTrends, reviewStats, conversion] = await Promise.all([
    Order.aggregate([
      { $match: orderMatch },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          units: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 20 },
    ]),
    Order.aggregate([
      { $match: orderMatch },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$category.name",
          units: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 15 },
    ]),
    SearchLog.aggregate([
      ...(Object.keys(searchMatch).length ? [{ $match: searchMatch }] : []),
      { $group: { _id: "$query", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    Review.aggregate([
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]),
    (async () => {
      const [orders, customers, searches] = await Promise.all([
        Order.countDocuments(orderMatch),
        User.countDocuments({ role: "customer", ...(createdAt ? { createdAt } : {}) }),
        SearchLog.countDocuments(searchMatch),
      ]);
      return {
        searches,
        customers,
        orders,
        orderRate: customers > 0 ? orders / customers : 0,
      };
    })(),
  ]);

  res.json({
    success: true,
    data: {
      topProducts,
      topCategories,
      searchTrends,
      reviewStats,
      conversion,
    },
  });
});
