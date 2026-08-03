import { Router } from "express";
import { firebaseAuth, getMe, login, register } from "../controllers/authController";
import { protect } from "../middleware/auth";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/firebase", firebaseAuth);
router.get("/me", protect, getMe);

export default router;
