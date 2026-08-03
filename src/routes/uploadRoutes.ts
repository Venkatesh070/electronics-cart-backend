import { Router } from "express";
import { uploadFile } from "../controllers/uploadController";
import { protect, requireAdmin } from "../middleware/auth";
import { uploadImage } from "../middleware/upload";

const router = Router();

router.post("/", protect, requireAdmin, uploadImage.single("file"), uploadFile);

export default router;
