import { Router } from "express";
import { autocomplete, logSearch, recentSearches, trendingSearches } from "../controllers/searchController";
import { optionalAuth, protect } from "../middleware/auth";

const router = Router();

router.get("/autocomplete", autocomplete);
router.get("/trending", trendingSearches);
router.get("/recent", protect, recentSearches);
router.post("/log", optionalAuth, logSearch);

export default router;
