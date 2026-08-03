import { Router } from "express";
import { createPage, deletePage, getPageBySlug, listPages, updatePage } from "../controllers/pageController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/admin", protect, requirePermission("cms", "view"), listPages);
router.get("/:slug", getPageBySlug);
router.post("/", protect, requirePermission("cms", "edit"), createPage);
router.put("/:id", protect, requirePermission("cms", "edit"), updatePage);
router.delete("/:id", protect, requirePermission("cms", "delete"), deletePage);

export default router;
