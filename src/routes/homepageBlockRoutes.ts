import { Router } from "express";
import {
  createBlock,
  deleteBlock,
  listActiveBlocks,
  listAllBlocks,
  updateBlock,
} from "../controllers/homepageBlockController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listActiveBlocks);
router.get("/admin", protect, requirePermission("cms", "view"), listAllBlocks);
router.post("/", protect, requirePermission("cms", "edit"), createBlock);
router.put("/:id", protect, requirePermission("cms", "edit"), updateBlock);
router.delete("/:id", protect, requirePermission("cms", "delete"), deleteBlock);

export default router;
