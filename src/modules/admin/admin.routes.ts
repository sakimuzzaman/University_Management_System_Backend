import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./admin.controller.js";
import {
  listUsersSchema,
  userIdSchema,
  updateUserRoleSchema,
  toggleUserStatusSchema,
  listAuditLogsSchema,
} from "./admin.validation.js";
import { Role } from "../../generated/prisma/enums.js";

const router = Router();

router.use(authenticate, authorize(Role.ADMIN));

router.get("/dashboard-stats", controller.dashboardStats);
router.get("/users", validate(listUsersSchema), controller.listUsers);
router.get("/users/:id", validate(userIdSchema), controller.getUserById);
router.patch("/users/:id/role", validate(updateUserRoleSchema), controller.updateUserRole);
router.patch("/users/:id/status", validate(toggleUserStatusSchema), controller.toggleUserStatus);
router.get("/audit-logs", validate(listAuditLogsSchema), controller.listAuditLogs);

export default router;