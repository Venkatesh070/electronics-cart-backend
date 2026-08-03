import { Router } from "express";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from "../controllers/addressController";
import { protect } from "../middleware/auth";

const router = Router();

router.use(protect);

router.get("/", listAddresses);
router.post("/", createAddress);
router.put("/:id", updateAddress);
router.delete("/:id", deleteAddress);

export default router;
