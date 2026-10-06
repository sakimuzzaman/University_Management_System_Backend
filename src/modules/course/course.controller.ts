import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as courseService from "./course.service";

export const create = asyncHandler(async (req, res) => {
  const course = await courseService.createCourse(req.body, req.user!.id, req.ip);
  sendResponse(res, 201, "Course created", course);
});

export const list = asyncHandler(async (req, res) => {
  const result = await courseService.listCourses(req.validated?.query ?? {});
  sendResponse(res, 200, "Courses fetched", result);
});

export const getOne = asyncHandler(async (req, res) => {
  const course = await courseService.getCourse(req.validated?.params.id);
  sendResponse(res, 200, "Course fetched", course);
});

export const update = asyncHandler(async (req, res) => {
  const course = await courseService.updateCourse(req.validated?.params.id, req.body, req.user!.id, req.ip);
  sendResponse(res, 200, "Course updated", course);
});

export const remove = asyncHandler(async (req, res) => {
  await courseService.softDeleteCourse(req.validated?.params.id, req.user!.id, req.ip);
  sendResponse(res, 200, "Course deleted", {});
});