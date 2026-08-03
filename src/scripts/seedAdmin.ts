import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "../config/db";
import { getFirebaseAuth, isFirebaseConfigured } from "../config/firebase";
import { User } from "../models/User";

async function ensureFirebaseAdmin(email: string, password: string, name: string) {
  if (!isFirebaseConfigured()) {
    console.warn("Firebase is not configured — admin was only saved in MongoDB.");
    return undefined;
  }

  const auth = getFirebaseAuth();

  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      password,
      displayName: name,
      emailVerified: true,
      disabled: false,
    });
    console.log(`Updated Firebase auth user: ${email} (${existing.uid})`);
    return existing.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") throw err;

    const created = await auth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
      disabled: false,
    });
    console.log(`Created Firebase auth user: ${email} (${created.uid})`);
    return created.uid;
  }
}

async function seedAdmin() {
  const mongoUri = process.env.MONGODB_URI;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = "Admin";

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set");
  }
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  await connectDB(mongoUri);

  const firebaseUid = await ensureFirebaseAdmin(email, password, name);
  const existing = await User.findOne({ email }).select("+password");

  if (existing) {
    existing.password = password;
    existing.role = "superadmin";
    existing.isBlocked = false;
    if (!existing.name) existing.name = name;
    if (firebaseUid) existing.firebaseUid = firebaseUid;
    if (!existing.authProviders?.includes("password")) {
      existing.authProviders = [...(existing.authProviders || []), "password"];
    }
    await existing.save();
    console.log(`Updated MongoDB admin: ${email} (role: superadmin)`);
  } else {
    await User.create({
      name,
      email,
      password,
      role: "superadmin",
      firebaseUid,
      authProviders: ["password"],
    });
    console.log(`Created MongoDB admin: ${email} (role: superadmin)`);
  }

  await import("mongoose").then(({ default: mongoose }) => mongoose.disconnect());
}

seedAdmin().catch((err) => {
  console.error("Failed to seed admin:", err);
  process.exit(1);
});
