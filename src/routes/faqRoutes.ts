import { Router } from "express";
import { createFaq, deleteFaq, listFaqs, updateFaq } from "../controllers/faqController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listFaqs);
router.post("/", protect, requirePermission("cms", "edit"), createFaq);
router.put("/:id", protect, requirePermission("cms", "edit"), updateFaq);
router.delete("/:id", protect, requirePermission("cms", "delete"), deleteFaq);

export default router;
