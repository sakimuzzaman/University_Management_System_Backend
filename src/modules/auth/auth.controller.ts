import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as authService from "./auth.service";

function refreshFrom(req: Request) {
  return req.body?.refreshToken || req.cookies?.refreshToken;
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register({ ...req.body, ipAddress: req.ip });
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, 201, "Registration successful", result);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login({ ...req.body, ipAddress: req.ip });
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, 200, "Login successful", result);
});

export const google = asyncHandler(async (req, res) => {
  const result = await authService.loginWithGoogle({ ...req.body, ipAddress: req.ip });
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, 200, "Google login successful", result);
});

export const refreshToken = asyncHandler(async (req, res) => {
  const result = await authService.refresh(refreshFrom(req));
  setRefreshCookie(res, result.refreshToken);
  sendResponse(res, 200, "Token refreshed", result);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user!.id, refreshFrom(req), req.ip);
  res.clearCookie("refreshToken");
  sendResponse(res, 200, "Logged out", {});
});