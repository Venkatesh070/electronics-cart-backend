import { Request, Response } from "express";
import { ApiKey, generateApiKey } from "../models/ApiKey";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listApiKeys = asyncHandler(async (_req: Request, res: Response) => {
  const keys = await ApiKey.find().select("-hashedKey").sort({ createdAt: -1 });
  res.json({ success: true, data: keys });
});

export const createApiKey = asyncHandler(async (req: Request, res: Response) => {
  const { name, scopes, rateLimitPerMinute } = req.body;
  if (!name) throw new ApiError(400, "name is required");

  const { plaintext, prefix, hashed } = generateApiKey();
  const key = await ApiKey.create({
    name,
    scopes,
    rateLimitPerMinute,
    keyPrefix: prefix,
    hashedKey: hashed,
  });

  res.status(201).json({
    success: true,
    data: { ...key.toObject(), hashedKey: undefined, plaintextKey: plaintext },
    message: "Save this key now — it will not be shown again.",
  });
});

export const revokeApiKey = asyncHandler(async (req: Request, res: Response) => {
  const key = await ApiKey.findByIdAndUpdate(req.params.id, { revoked: true }, { new: true }).select("-hashedKey");
  if (!key) throw new ApiError(404, "API key not found");
  res.json({ success: true, data: key });
});
