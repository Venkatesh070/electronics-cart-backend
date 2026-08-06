import fs from "fs";
import path from "path";
import multer, { FileFilterCallback } from "multer";
import { Request } from "express";
import { ApiError } from "../utils/ApiError";

export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

export const UPLOAD_FOLDERS = ["products", "brands", "categories", "avatars", "misc"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export function ensureUploadDirs() {
  for (const folder of UPLOAD_FOLDERS) {
    const dir = path.join(UPLOAD_ROOT, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

ensureUploadDirs();

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const folder = ((req.query.folder as string) || "misc").toLowerCase();
    const safe = UPLOAD_FOLDERS.includes(folder as UploadFolder) ? folder : "misc";
    const dir = path.join(UPLOAD_ROOT, safe);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const base =
      path
        .basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, "")
        .slice(0, 40) || "image";
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new ApiError(400, "Only image files are allowed"));
  }
  cb(null, true);
}

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
