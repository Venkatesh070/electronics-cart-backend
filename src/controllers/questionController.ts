import { Request, Response } from "express";
import { Question } from "../models/Question";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listProductQuestions = asyncHandler(async (req: Request, res: Response) => {
  const questions = await Question.find({ product: req.params.productId })
    .populate("user", "name")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: questions });
});

export const askQuestion = asyncHandler(async (req: Request, res: Response) => {
  const { product, question } = req.body;
  if (!product || !question) throw new ApiError(400, "product and question are required");

  const doc = await Question.create({ product, question, user: req.user!._id });
  res.status(201).json({ success: true, data: doc });
});

export const answerQuestion = asyncHandler(async (req: Request, res: Response) => {
  const { answer } = req.body;
  if (!answer) throw new ApiError(400, "answer is required");

  const question = await Question.findByIdAndUpdate(
    req.params.id,
    { answer, answeredBy: req.user!._id, answeredAt: new Date() },
    { new: true }
  );
  if (!question) throw new ApiError(404, "Question not found");
  res.json({ success: true, data: question });
});
