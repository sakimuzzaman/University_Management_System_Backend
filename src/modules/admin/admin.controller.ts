import { Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as adminService from "./admin.service";

function actor(req: Request) {
  return { id: req.user!.id, role: req.user!.role };
}

export const dashboardStats = asyncHandler(async (req, res) => {
  const data = await adminService.getDashboardStats(req.user!.id, req.ip);
  sendResponse(res, 200, "Admin dashboard statistics fetched successfully", data);
});

export const listUsers = asyncHandler(async (req, res) => {
  const data = await adminService.listUsers(req.validated?.query ?? {}, req.user!.id, req.ip);
  sendResponse(res, 200, "Users list fetched successfully", data);
});

export const getUserById = asyncHandler(async (req, res) => {
  const data = await adminService.getUserById(req.validated?.params.id);
  sendResponse(res, 200, "User details fetched successfully", data);
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const data = await adminService.updateUserRole(
    req.validated?.params.id,
    req.body.role,
    actor(req),
    req.ip
  );
  sendResponse(res, 200, "User role updated successfully", data);
});

export const toggleUserStatus = asyncHandler(async (req, res) => {
  const data = await adminService.toggleUserStatus(
    req.validated?.params.id,
    req.body.isActive,
    actor(req),
    req.ip
  );
  sendResponse(res, 200, `User ${req.body.isActive ? "activated" : "deactivated"} successfully`, data);
});

export const listAuditLogs = asyncHandler(async (req, res) => {
  const data = await adminService.listAuditLogs(req.validated?.query ?? {}, req.user!.id, req.ip);
  sendResponse(res, 200, "Audit logs fetched successfully", data);
});