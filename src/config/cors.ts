import { CorsOptions } from "cors";

/**
 * CLIENT_ORIGIN is a comma-separated allowlist (admin panel + storefront are
 * separate origins). If it's unset we stay permissive in development for
 * local convenience, but fail closed in production instead of defaulting to "*" —
 * an open API origin is unnecessary since the app already has no cookie-based
 * auth to protect, and it needlessly widens the attack surface for abuse.
 */
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    // No Origin header: same-origin requests, curl, server-to-server calls, Swagger UI "Try it out".
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) {
      return callback(null, process.env.NODE_ENV !== "production");
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  credentials: true,
};
