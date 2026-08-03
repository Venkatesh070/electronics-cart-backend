import { Request, Response } from "express";
import { Wishlist } from "../models/Wishlist";
import { Product } from "../models/Product";
import { Cart } from "../models/Cart";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

async function getOrCreateWishlist(userId: string) {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) wishlist = await Wishlist.create({ user: userId, items: [] });
  return wishlist;
}

export const getWishlist = asyncHandler(async (req: Request, res: Response) => {
  const wishlist = await getOrCreateWishlist(req.user!._id.toString());
  await wishlist.populate("items.product");
  res.json({ success: true, data: wishlist });
});

export const addToWishlist = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.body;
  if (!productId) throw new ApiError(400, "productId is required");

  const product = await Product.findById(productId);
  if (!product) throw new ApiError(404, "Product not found");

  const wishlist = await getOrCreateWishlist(req.user!._id.toString());
  const exists = wishlist.items.some((item) => item.product.toString() === productId);
  if (!exists) {
    wishlist.items.push({ product: product._id, addedAt: new Date(), priceWhenAdded: product.price });
    await wishlist.save();
  }

  await wishlist.populate("items.product");
  res.json({ success: true, data: wishlist });
});

export const removeFromWishlist = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const wishlist = await getOrCreateWishlist(req.user!._id.toString());

  wishlist.items = wishlist.items.filter((item) => item.product.toString() !== productId);
  await wishlist.save();
  await wishlist.populate("items.product");
  res.json({ success: true, data: wishlist });
});

export const getSharedWishlist = asyncHandler(async (req: Request, res: Response) => {
  const wishlist = await Wishlist.findById(req.params.wishlistId).populate("items.product");
  if (!wishlist) throw new ApiError(404, "Wishlist not found");
  res.json({ success: true, data: wishlist });
});

export const moveToCart = asyncHandler(async (req: Request, res: Response) => {
  const { productId } = req.params;
  const userId = req.user!._id.toString();

  const wishlist = await getOrCreateWishlist(userId);
  const item = wishlist.items.find((i) => i.product.toString() === productId);
  if (!item) throw new ApiError(404, "Item not found in wishlist");

  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });

  const existingCartItem = cart.items.find((i) => i.product.toString() === productId);
  if (existingCartItem) existingCartItem.quantity += 1;
  else cart.items.push({ product: item.product, quantity: 1 });
  await cart.save();

  wishlist.items = wishlist.items.filter((i) => i.product.toString() !== productId);
  await wishlist.save();

  res.json({ success: true, data: { wishlist, cart } });
});
