import { Router } from "express";
import { authenticate } from "../../middlewares/auth.js";
import { authLimiter } from "../../middlewares/rateLimiter.js";
import { validate } from "../../middlewares/validate.js";
import * as authController from "./auth.controller.js";
import { googleSchema, loginSchema, logoutSchema, refreshSchema, registerSchema } from "./auth.validation.js";

const router = Router();

router.use(authLimiter);
router.post("/register", validate(registerSchema), authController.register);
router.post("/login", validate(loginSchema), authController.login);
router.post("/google", validate(googleSchema), authController.google);
router.post("/refresh-token", validate(refreshSchema), authController.refreshToken);
router.post("/logout", authenticate, validate(logoutSchema), authController.logout);

export default router;