import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { connectDB } from "./config/db";

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI as string;

async function start() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set. Copy .env.example to .env and fill it in.");
  }
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set. Copy .env.example to .env and fill it in.");
  }

  await connectDB(MONGODB_URI);

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
