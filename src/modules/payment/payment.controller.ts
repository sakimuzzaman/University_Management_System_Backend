import { Request } from "express";
import Stripe from "stripe";
import { env } from "../../config/env";
import { getStripe } from "../../config/stripe";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendResponse } from "../../utils/sendResponse";
import * as paymentService from "./payment.service";

function actor(req: Request) {
  return { id: req.user!.id, role: req.user!.role };
}

export const initiate = asyncHandler(async (req, res) => {
  const data = await paymentService.initiatePayment(req.body, actor(req), req.ip);
  sendResponse(res, 201, "Checkout session created. Complete the payment at checkoutUrl", data);
});

export const myPayments = asyncHandler(async (req, res) => {
  const data = await paymentService.listMyPayments(req.user!.id, req.validated?.query ?? {});
  sendResponse(res, 200, "Payments fetched", data);
});

export const getPayment = asyncHandler(async (req, res) => {
  const data = await paymentService.getPayment(req.validated?.params.id, actor(req));
  sendResponse(res, 200, "Payment fetched", data);
});

export const cancel = asyncHandler(async (req, res) => {
  const data = await paymentService.cancelPayment(req.validated?.params.id, actor(req), req.ip);
  sendResponse(res, 200, "Payment canceled", data);
});

export const refund = asyncHandler(async (req, res) => {
  const data = await paymentService.refundPayment(req.validated?.params.id, actor(req), req.ip);
  sendResponse(res, 200, "Payment refunded", data);
});

export const checkoutSuccess = asyncHandler(async (req, res) => {
  const data = await paymentService.getCheckoutResult(req.validated?.query.session_id);
  sendResponse(res, 200, "Checkout completed", data);
});

export const checkoutCancel = asyncHandler(async (req, res) => {
  const data = await paymentService.getCheckoutResult(req.validated?.query.session_id);
  sendResponse(res, 200, "Checkout canceled", data);
});

/**
 * Called by Stripe with a raw body. Signature is verified against
 * STRIPE_WEBHOOK_SECRET before anything is trusted.
 */
export const webhook = asyncHandler(async (req, res) => {
  const signatureHeader = req.headers["stripe-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!signature) {
    return res
      .status(400)
      .json({ success: false, message: "Missing stripe-signature header", errors: [] });
  }

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return res
      .status(503)
      .json({ success: false, message: "Stripe webhook is not configured", errors: [] });
  }

  const raw = Buffer.isBuffer(req.body)
    ? req.body
    : typeof req.body === "string"
      ? Buffer.from(req.body)
      : req.body && typeof req.body === "object"
        ? Buffer.from(JSON.stringify(req.body))
        : Buffer.alloc(0);

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return res.status(400).json({
      success: false,
      message: `Webhook signature verification failed: ${message}`,
      errors: [],
    });
  }

  const result = await paymentService.handleStripeEvent(event);
  return res.status(200).json({ success: true, message: "Webhook received", data: result });
});