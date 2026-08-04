import { Router } from "express";
import { protect, requirePermission } from "../../middleware/auth";
import { getDashboard, getReports } from "../../controllers/analyticsController";
import {
  adjustStock,
  createWarehouse,
  flagReorder,
  listAdjustmentLog,
  listLowStock,
  listWarehouses,
} from "../../controllers/inventoryController";
import {
  addCustomerNote,
  getCustomerProfile,
  listCustomers,
  setBlockedStatus,
} from "../../controllers/customerController";
import { createRole, deleteRole, listRoles, updateRole } from "../../controllers/adminRoleController";
import { assignRole, createStaff, listStaff } from "../../controllers/staffController";
import { createTaxRule, deleteTaxRule, listTaxRules, updateTaxRule } from "../../controllers/taxRuleController";
import {
  createShippingZone,
  deleteShippingZone,
  listShippingZones,
  updateShippingZone,
} from "../../controllers/shippingZoneController";
import { listGateways, upsertGateway } from "../../controllers/paymentSettingsController";
import { getSettings, updateSettings } from "../../controllers/systemSettingsController";
import { createApiKey, listApiKeys, revokeApiKey } from "../../controllers/apiKeyController";
import { createWebhook, deleteWebhook, listWebhooks, updateWebhook } from "../../controllers/webhookController";
import { listAuditLogs } from "../../controllers/auditLogController";
import {
  createCampaign,
  deleteCampaign,
  getCampaignById,
  listCampaigns,
  sendCampaign,
  updateCampaign,
} from "../../controllers/campaignController";

const router = Router();

router.use(protect);

// 1. Dashboard
router.get("/dashboard", requirePermission("dashboard", "view"), getDashboard);

// 5. Inventory
router.get("/inventory/warehouses", requirePermission("inventory", "view"), listWarehouses);
router.post("/inventory/warehouses", requirePermission("inventory", "edit"), createWarehouse);
router.get("/inventory/low-stock", requirePermission("inventory", "view"), listLowStock);
router.get("/inventory/adjustments", requirePermission("inventory", "view"), listAdjustmentLog);
router.post("/inventory/adjust", requirePermission("inventory", "edit"), adjustStock);
router.post("/inventory/:productId/reorder", requirePermission("inventory", "edit"), flagReorder);

// 8. Customers
router.get("/customers", requirePermission("customers", "view"), listCustomers);
router.get("/customers/:id", requirePermission("customers", "view"), getCustomerProfile);
router.put("/customers/:id/block", requirePermission("customers", "edit"), setBlockedStatus);
router.post("/customers/:id/notes", requirePermission("customers", "edit"), addCustomerNote);

// 9–15 marketing pieces live on their own routers (/api/coupons, /api/banners, …)

// 13. Marketing campaigns
router.get("/campaigns", requirePermission("marketing", "view"), listCampaigns);
router.get("/campaigns/:id", requirePermission("marketing", "view"), getCampaignById);
router.post("/campaigns", requirePermission("marketing", "edit"), createCampaign);
router.put("/campaigns/:id", requirePermission("marketing", "edit"), updateCampaign);
router.delete("/campaigns/:id", requirePermission("marketing", "delete"), deleteCampaign);
router.post("/campaigns/:id/send", requirePermission("marketing", "edit"), sendCampaign);

// 16. Taxes
router.get("/taxes", requirePermission("taxes", "view"), listTaxRules);
router.post("/taxes", requirePermission("taxes", "edit"), createTaxRule);
router.put("/taxes/:id", requirePermission("taxes", "edit"), updateTaxRule);
router.delete("/taxes/:id", requirePermission("taxes", "delete"), deleteTaxRule);

// 17. Shipping
router.get("/shipping", requirePermission("shipping", "view"), listShippingZones);
router.post("/shipping", requirePermission("shipping", "edit"), createShippingZone);
router.put("/shipping/:id", requirePermission("shipping", "edit"), updateShippingZone);
router.delete("/shipping/:id", requirePermission("shipping", "delete"), deleteShippingZone);

// 18. Payment settings
router.get("/payment-settings", requirePermission("payment-settings", "view"), listGateways);
router.put("/payment-settings", requirePermission("payment-settings", "edit"), upsertGateway);

// 19. User roles + staff
router.get("/roles", requirePermission("roles", "view"), listRoles);
router.post("/roles", requirePermission("roles", "edit"), createRole);
router.put("/roles/:id", requirePermission("roles", "edit"), updateRole);
router.delete("/roles/:id", requirePermission("roles", "delete"), deleteRole);

router.get("/staff", requirePermission("roles", "view"), listStaff);
router.post("/staff", requirePermission("roles", "edit"), createStaff);
router.put("/staff/:id/role", requirePermission("roles", "edit"), assignRole);

// 20. Reports
router.get("/reports", requirePermission("reports", "view"), getReports);

// 23. Audit logs
router.get("/audit-logs", requirePermission("audit-logs", "view"), listAuditLogs);

// 24. API management
router.get("/api-keys", requirePermission("api-management", "view"), listApiKeys);
router.post("/api-keys", requirePermission("api-management", "edit"), createApiKey);
router.delete("/api-keys/:id", requirePermission("api-management", "delete"), revokeApiKey);

router.get("/webhooks", requirePermission("api-management", "view"), listWebhooks);
router.post("/webhooks", requirePermission("api-management", "edit"), createWebhook);
router.put("/webhooks/:id", requirePermission("api-management", "edit"), updateWebhook);
router.delete("/webhooks/:id", requirePermission("api-management", "delete"), deleteWebhook);

// 25. System settings
router.get("/settings", requirePermission("settings", "view"), getSettings);
router.put("/settings", requirePermission("settings", "edit"), updateSettings);

export default router;
