import { Router } from "express";
import { answerQuestion, askQuestion, listProductQuestions } from "../controllers/questionController";
import { protect, requireAdmin } from "../middleware/auth";

const router = Router();

router.get("/product/:productId", listProductQuestions);
router.post("/", protect, askQuestion);
router.put("/:id/answer", protect, requireAdmin, answerQuestion);

export default router;
