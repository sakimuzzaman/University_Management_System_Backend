import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import * as controller from "./department.controller";
import { createDepartmentSchema, listSchema } from "./department.validation";

const router = Router();

router.get("/", validate(listSchema), controller.list);
router.post("/", authenticate, authorize("ADMIN"), validate(createDepartmentSchema), controller.create);

export default router;