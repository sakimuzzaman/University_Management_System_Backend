import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./program.controller.js";
import { createProgramSchema, listProgramSchema } from "./program.validation.js";

const router = Router();

router.get("/", validate(listProgramSchema), controller.list);
router.post("/", authenticate, authorize("ADMIN"), validate(createProgramSchema), controller.create);

export default router;