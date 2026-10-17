import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as userController from "./user.controller.js";
import { studentProfileSchema, updateMeSchema } from "./user.validation.js";

const router = Router();

router.use(authenticate);
router.get("/me", userController.getMe);
router.patch("/me", validate(updateMeSchema), userController.updateMe);
router.post("/me/student-profile", validate(studentProfileSchema), userController.createStudentProfile);

export default router;