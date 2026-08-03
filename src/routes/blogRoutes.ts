import { Router } from "express";
import {
  adminListPosts,
  createPost,
  deletePost,
  getPostBySlug,
  listPosts,
  updatePost,
} from "../controllers/blogController";
import { protect, requirePermission } from "../middleware/auth";

const router = Router();

router.get("/", listPosts);
router.get("/admin", protect, requirePermission("blog", "view"), adminListPosts);
router.get("/:slug", getPostBySlug);
router.post("/", protect, requirePermission("blog", "edit"), createPost);
router.put("/:id", protect, requirePermission("blog", "edit"), updatePost);
router.delete("/:id", protect, requirePermission("blog", "delete"), deletePost);

export default router;
