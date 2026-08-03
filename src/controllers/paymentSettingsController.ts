import { Request, Response } from "express";
import { PaymentGatewaySettings } from "../models/PaymentGatewaySettings";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const listGateways = asyncHandler(async (_req: Request, res: Response) => {
  const gateways = await PaymentGatewaySettings.find().select("+credentials");
  res.json({
    success: true,
    data: gateways.map((g) => ({
      _id: g._id,
      provider: g.provider,
      enabled: g.enabled,
      settlementAccount: g.settlementAccount,
      credentialsSet: Object.keys(g.credentials || {}).length > 0,
    })),
  });
});

export const upsertGateway = asyncHandler(async (req: Request, res: Response) => {
  const { provider, enabled, credentials, settlementAccount } = req.body;
  if (!provider) throw new ApiError(400, "provider is required");

  const gateway = await PaymentGatewaySettings.findOneAndUpdate(
    { provider },
    { enabled, credentials, settlementAccount },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: { provider: gateway.provider, enabled: gateway.enabled, settlementAccount: gateway.settlementAccount } });
});
