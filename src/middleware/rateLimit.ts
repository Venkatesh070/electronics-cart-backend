import rateLimit from "express-rate-limit";

const isProd = process.env.NODE_ENV === "production";

/** Broad safety net across all /api routes. Off in local/dev so HMR + OTP testing don't 429. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 300 : 50_000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProd,
  message: { success: false, message: "Too many requests. Please try again later." },
});

/** Tighter limit for login/register/firebase — brute-forceable auth surface. Off in local/dev. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 5_000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !isProd,
  message: { success: false, message: "Too many attempts. Please try again later." },
});
