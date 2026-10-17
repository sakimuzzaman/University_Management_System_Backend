import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as programService from "./program.service.js";

export const create = asyncHandler(async (req, res) => {
  const program = await programService.createProgram(req.body, req.user!.id, req.ip);
  sendResponse(res, 201, "Program created", program);
});

export const list = asyncHandler(async (req, res) => {
  const result = await programService.listPrograms(req.validated?.query ?? {});
  sendResponse(res, 200, "Programs fetched", result);
});