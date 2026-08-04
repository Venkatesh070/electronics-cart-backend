import fs from "fs";
import path from "path";
import { AppOptions, cert, getApps, initializeApp } from "firebase-admin/app";
import { Auth, DecodedIdToken, getAuth } from "firebase-admin/auth";

type ServiceAccountJson = {
  project_id: string;
  client_email: string;
  private_key: string;
};

function loadServiceAccountFromFile(): ServiceAccountJson | null {
  const configured = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!configured) return null;

  const filePath = path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);

  // Fall through to FIREBASE_* env vars when the JSON file isn't present.
  if (!fs.existsSync(filePath)) return null;

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as ServiceAccountJson;
}

function resolveCredential(): { projectId: string; clientEmail: string; privateKey: string } | null {
  const fromFile = loadServiceAccountFromFile();
  if (fromFile?.project_id && fromFile.client_email && fromFile.private_key) {
    return {
      projectId: fromFile.project_id,
      clientEmail: fromFile.client_email,
      privateKey: fromFile.private_key.replace(/\\n/g, "\n"),
    };
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

export function isFirebaseConfigured(): boolean {
  try {
    return Boolean(resolveCredential());
  } catch {
    return false;
  }
}

export function getFirebaseAuth(): Auth {
  const credential = resolveCredential();
  if (!credential) {
    throw new Error(
      "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY."
    );
  }

  if (!getApps().length) {
    const options: AppOptions = {
      credential: cert({
        projectId: credential.projectId,
        clientEmail: credential.clientEmail,
        privateKey: credential.privateKey,
      }),
      projectId: credential.projectId,
    };
    initializeApp(options);
  }

  return getAuth();
}

export type FirebaseSignInProvider = "password" | "google.com" | "phone" | "unknown";

export function detectProvider(decoded: DecodedIdToken): FirebaseSignInProvider {
  const provider = decoded.firebase?.sign_in_provider;
  if (provider === "password" || provider === "google.com" || provider === "phone") {
    return provider;
  }
  return "unknown";
}
