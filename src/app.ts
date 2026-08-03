import cors from "cors";
import express from "express";
import morgan from "morgan";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import addressRoutes from "./routes/addressRoutes";
import paymentMethodRoutes from "./routes/paymentMethodRoutes";
import cartRoutes from "./routes/cartRoutes";
import orderRoutes from "./routes/orderRoutes";
import productRoutes from "./routes/productRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import brandRoutes from "./routes/brandRoutes";
import searchRoutes from "./routes/searchRoutes";
import wishlistRoutes from "./routes/wishlistRoutes";
import reviewRoutes from "./routes/reviewRoutes";
import questionRoutes from "./routes/questionRoutes";
import couponRoutes from "./routes/couponRoutes";
import giftCardRoutes from "./routes/giftCardRoutes";
import returnRoutes from "./routes/returnRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import ticketRoutes from "./routes/ticketRoutes";
import faqRoutes from "./routes/faqRoutes";
import pageRoutes from "./routes/pageRoutes";
import homepageBlockRoutes from "./routes/homepageBlockRoutes";
import blogRoutes from "./routes/blogRoutes";
import bannerRoutes from "./routes/bannerRoutes";
import flashSaleRoutes from "./routes/flashSaleRoutes";
import analyticsRoutes from "./routes/analyticsRoutes";
import adminRoutes from "./routes/admin";
import newsletterRoutes from "./routes/newsletterRoutes";
import shippingRoutes from "./routes/shippingRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import { setupSwagger } from "./config/swagger";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { UPLOAD_ROOT, ensureUploadDirs } from "./middleware/upload";

ensureUploadDirs();

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", express.static(UPLOAD_ROOT));

setupSwagger(app);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/gift-cards", giftCardRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/faqs", faqRoutes);
app.use("/api/pages", pageRoutes);
app.use("/api/homepage-blocks", homepageBlockRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/flash-sales", flashSaleRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/payments", paymentRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
