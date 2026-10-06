import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import * as controller from "./program.controller";
import { createProgramSchema, listProgramSchema } from "./program.validation";

const router = Router();

router.get("/", validate(listProgramSchema), controller.list);
router.post("/", authenticate, authorize("ADMIN"), validate(createProgramSchema), controller.create);

export default router;