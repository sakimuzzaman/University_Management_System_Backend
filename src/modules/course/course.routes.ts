import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import * as controller from "./course.controller";
import { courseIdSchema, createCourseSchema, listCourseSchema, updateCourseSchema } from "./course.validation";

const router = Router();

router.get("/", validate(listCourseSchema), controller.list);
router.get("/:id", validate(courseIdSchema), controller.getOne);
router.post("/", authenticate, authorize("ADMIN"), validate(createCourseSchema), controller.create);
router.patch("/:id", authenticate, authorize("ADMIN"), validate(updateCourseSchema), controller.update);
router.delete("/:id", authenticate, authorize("ADMIN"), validate(courseIdSchema), controller.remove);

export default router;