import { Request, Response } from "express";
import { AuthProvider, User } from "../models/User";
import { generateToken } from "../utils/generateToken";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { detectProvider, getFirebaseAuth, isFirebaseConfigured } from "../config/firebase";

function publicUser(user: {
  _id: { toString(): string };
  name: string;
  email?: string;
  phone?: string;
  role: string;
  authProviders?: string[];
  avatar?: string;
  createdAt?: Date;
  notificationPreferences?: {
    orderUpdates: boolean;
    priceDrops: boolean;
    promotions: boolean;
    supportReplies: boolean;
  };
}) {
  const verified = Boolean(user.email || user.phone);
  return {
    id: user._id,
    name: user.name,
    email: user.email || null,
    phone: user.phone || null,
    role: user.role,
    authProviders: user.authProviders || [],
    avatar: user.avatar || null,
    createdAt: user.createdAt || null,
    verified,
    notificationPreferences: user.notificationPreferences || {
      orderUpdates: true,
      priceDrops: true,
      promotions: true,
      supportReplies: true,
    },
  };
}

function authResponse(user: Parameters<typeof publicUser>[0], status = 200) {
  return {
    status,
    body: {
      success: true,
      data: {
        user: publicUser(user),
        token: generateToken(user._id.toString()),
      },
    },
  };
}

function mapFirebaseProvider(signInProvider: string): AuthProvider {
  if (signInProvider === "google.com") return "google";
  if (signInProvider === "phone") return "phone";
  if (signInProvider === "password") return "password";
  return "firebase";
}

async function findUserByFirebaseIdentity(opts: {
  firebaseUid: string;
  email?: string | null;
  phone?: string | null;
}) {
  const or: Record<string, string>[] = [{ firebaseUid: opts.firebaseUid }];
  if (opts.email) or.push({ email: opts.email.toLowerCase() });
  if (opts.phone) or.push({ phone: opts.phone });
  return User.findOne({ $or: or });
}

/**
 * Unified Firebase auth for Google, phone OTP, and email/password.
 * Client signs in with Firebase SDK and posts the ID token here.
 */
export const firebaseAuth = asyncHandler(async (req: Request, res: Response) => {
  if (!isFirebaseConfigured()) {
    throw new ApiError(503, "Firebase auth is not configured on the server");
  }

  const { idToken, name } = req.body as { idToken?: string; name?: string };
  if (!idToken) throw new ApiError(400, "idToken is required");

  let decoded;
  try {
    decoded = await getFirebaseAuth().verifyIdToken(idToken);
  } catch {
    throw new ApiError(401, "Invalid or expired Firebase ID token");
  }

  const email = decoded.email?.toLowerCase() || undefined;
  const phone = decoded.phone_number || undefined;
  const provider = mapFirebaseProvider(detectProvider(decoded));
  const displayName =
    (typeof name === "string" && name.trim()) ||
    decoded.name ||
    (email ? email.split("@")[0] : undefined) ||
    (phone ? `User ${phone.slice(-4)}` : "User");

  if (!email && !phone) {
    throw new ApiError(400, "Firebase account must have an email or phone number");
  }

  let user = await findUserByFirebaseIdentity({
    firebaseUid: decoded.uid,
    email,
    phone,
  });

  if (user?.isBlocked) throw new ApiError(403, "This account has been blocked");

  if (!user) {
    user = await User.create({
      name: displayName,
      email,
      phone,
      firebaseUid: decoded.uid,
      authProviders: [provider],
      avatar: decoded.picture,
      role: "customer",
    });

    const created = authResponse(user, 201);
    return res.status(created.status).json(created.body);
  }

  let dirty = false;
  if (!user.firebaseUid) {
    user.firebaseUid = decoded.uid;
    dirty = true;
  }
  if (email && !user.email) {
    user.email = email;
    dirty = true;
  }
  if (phone && !user.phone) {
    user.phone = phone;
    dirty = true;
  }
  if (decoded.picture && !user.avatar) {
    user.avatar = decoded.picture;
    dirty = true;
  }
  if (!user.authProviders.includes(provider)) {
    user.authProviders.push(provider);
    dirty = true;
  }
  if (dirty) await user.save();

  const result = authResponse(user);
  res.status(result.status).json(result.body);
});

/**
 * Email/password register.
 * When Firebase is configured, also creates the user in Firebase Auth.
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, phone } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
  };

  if (!name || !email || !password) {
    throw new ApiError(400, "name, email and password are required");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw new ApiError(409, "An account with this email already exists");

  if (phone) {
    const phoneTaken = await User.findOne({ phone });
    if (phoneTaken) throw new ApiError(409, "An account with this phone already exists");
  }

  let firebaseUid: string | undefined;

  if (isFirebaseConfigured()) {
    try {
      const fbUser = await getFirebaseAuth().createUser({
        email: normalizedEmail,
        password,
        displayName: name,
        phoneNumber: phone || undefined,
      });
      firebaseUid = fbUser.uid;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/email-already-exists") {
        throw new ApiError(409, "An account with this email already exists");
      }
      if (code === "auth/phone-number-already-exists") {
        throw new ApiError(409, "An account with this phone already exists");
      }
      if (code === "auth/invalid-phone-number") {
        throw new ApiError(400, "Invalid phone number. Use E.164 format, e.g. +919876543210");
      }
      throw new ApiError(400, (err as Error).message || "Failed to create Firebase user");
    }
  }

  const user = await User.create({
    name,
    email: normalizedEmail,
    phone,
    password,
    firebaseUid,
    authProviders: ["password"],
    role: "customer",
  });

  const result = authResponse(user, 201);
  res.status(result.status).json(result.body);
});

/**
 * Email/password login.
 * Prefers Firebase Identity Toolkit when configured; falls back to local password hash.
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    throw new ApiError(400, "email and password are required");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const apiKey = process.env.FIREBASE_API_KEY;

  if (isFirebaseConfigured() && apiKey) {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const payload = (await response.json()) as {
      idToken?: string;
      localId?: string;
      error?: { message?: string };
    };

    if (!response.ok || !payload.idToken || !payload.localId) {
      throw new ApiError(401, "Invalid email or password");
    }

    let user = await User.findOne({
      $or: [{ firebaseUid: payload.localId }, { email: normalizedEmail }],
    });

    if (!user) {
      const fbUser = await getFirebaseAuth().getUser(payload.localId);
      user = await User.create({
        name: fbUser.displayName || normalizedEmail.split("@")[0],
        email: normalizedEmail,
        phone: fbUser.phoneNumber,
        firebaseUid: payload.localId,
        authProviders: ["password"],
        role: "customer",
      });
    } else {
      if (user.isBlocked) throw new ApiError(403, "This account has been blocked");
      if (!user.firebaseUid) {
        user.firebaseUid = payload.localId;
        if (!user.authProviders.includes("password")) user.authProviders.push("password");
        await user.save();
      }
    }

    const result = authResponse(user);
    return res.status(result.status).json(result.body);
  }

  // Local bcrypt fallback (e.g. seeded admin before Firebase is wired)
  const user = await User.findOne({ email: normalizedEmail }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Invalid email or password");
  }
  if (user.isBlocked) throw new ApiError(403, "This account has been blocked");

  const result = authResponse(user);
  res.status(result.status).json(result.body);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    success: true,
    data: publicUser(user),
  });
});
