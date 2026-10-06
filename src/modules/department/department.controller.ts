import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as departmentService from "./department.service";

export const create = asyncHandler(async (req, res) => {
  const department = await departmentService.createDepartment(req.body, req.user!.id, req.ip);
  sendResponse(res, 201, "Department created", department);
});

export const list = asyncHandler(async (req, res) => {
  const result = await departmentService.listDepartments(req.validated?.query ?? {});
  sendResponse(res, 200, "Departments fetched", result);
});