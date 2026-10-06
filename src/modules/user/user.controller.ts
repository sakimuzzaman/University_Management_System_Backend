import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as userService from "./user.service";

export const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getMe(req.user!.id);
  sendResponse(res, 200, "Profile fetched", user);
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateMe(req.user!.id, req.body, req.ip);
  sendResponse(res, 200, "Profile updated", user);
});

export const createStudentProfile = asyncHandler(async (req, res) => {
  const profile = await userService.createStudentProfile(req.user!.id, req.user!.role, req.body, req.ip);
  sendResponse(res, 201, "Student profile created", profile);
});