import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { UPLOAD_FOLDERS, UploadFolder } from "../middleware/upload";

export const uploadFile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No image file uploaded");

  const folder = ((req.query.folder as string) || "misc").toLowerCase();
  const safe = UPLOAD_FOLDERS.includes(folder as UploadFolder) ? folder : "misc";
  const url = `/uploads/${safe}/${req.file.filename}`;

  res.status(201).json({
    success: true,
    data: {
      url,
      filename: req.file.filename,
      folder: safe,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
  });
});
