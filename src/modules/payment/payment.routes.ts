import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import * as controller from "./payment.controller.js";
import {
  checkoutSessionSchema,
  initiatePaymentSchema,
  listMyPaymentsSchema,
  paymentIdSchema,
} from "./payment.validation.js";
import { Role } from "../../generated/prisma/enums.js";

const router = Router();

router.post(
  "/initiate",
  authenticate,
  authorize(Role.STUDENT),
  validate(initiatePaymentSchema),
  controller.initiate,
);

router.get(
  "/my",
  authenticate,
  authorize(Role.STUDENT),
  validate(listMyPaymentsSchema),
  controller.myPayments,
);

// Public redirect targets from the Stripe checkout page. They expose only
// status information for an unguessable session id.
router.get("/checkout-success", validate(checkoutSessionSchema), controller.checkoutSuccess);
router.get("/checkout-cancel", validate(checkoutSessionSchema), controller.checkoutCancel);

router.get("/:id", authenticate, validate(paymentIdSchema), controller.getPayment);

router.post(
  "/:id/cancel",
  authenticate,
  authorize(Role.STUDENT),
  validate(paymentIdSchema),
  controller.cancel,
);

router.post(
  "/:id/refund",
  authenticate,
  authorize(Role.ADMIN),
  validate(paymentIdSchema),
  controller.refund,
);

export default router;