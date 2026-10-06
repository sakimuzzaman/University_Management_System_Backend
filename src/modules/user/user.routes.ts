import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import * as userController from "./user.controller";
import { studentProfileSchema, updateMeSchema } from "./user.validation";

const router = Router();

router.use(authenticate);
router.get("/me", userController.getMe);
router.patch("/me", validate(updateMeSchema), userController.updateMe);
router.post("/me/student-profile", validate(studentProfileSchema), userController.createStudentProfile);

export default router;