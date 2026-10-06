import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as programService from "./program.service";

export const create = asyncHandler(async (req, res) => {
  const program = await programService.createProgram(req.body, req.user!.id, req.ip);
  sendResponse(res, 201, "Program created", program);
});

export const list = asyncHandler(async (req, res) => {
  const result = await programService.listPrograms(req.validated?.query ?? {});
  sendResponse(res, 200, "Programs fetched", result);
});