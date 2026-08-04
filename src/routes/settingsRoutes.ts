import { Router } from "express";
import { getPublicSettings } from "../controllers/systemSettingsController";

const router = Router();

router.get("/", getPublicSettings);

export default router;
