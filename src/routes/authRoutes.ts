import { Router } from "express";
import { firebaseAuth, getMe, login, register } from "../controllers/authController";
import { protect } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/firebase", authLimiter, firebaseAuth);
router.get("/me", protect, getMe);

export default router;
