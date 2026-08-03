import jwt, { SignOptions } from "jsonwebtoken";

export function generateToken(userId: string): string {
  const secret = process.env.JWT_SECRET as string;
  const expiresIn = (process.env.JWT_EXPIRES_IN || "7d") as SignOptions["expiresIn"];
  return jwt.sign({ id: userId }, secret, { expiresIn });
}
