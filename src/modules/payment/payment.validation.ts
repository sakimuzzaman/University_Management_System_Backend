import { z } from "zod";
import { PaymentStatus } from "../../generated/prisma/enums";

const uuid = z.string().uuid();
const page = z.coerce.number().int().positive().optional();
const limit = z.coerce.number().int().positive().max(100).optional();

export const initiatePaymentSchema = z.object({
  body: z.object({
    semesterId: uuid,
  }),
});

export const listMyPaymentsSchema = z.object({
  query: z.object({
    page,
    limit,
    status: z.nativeEnum(PaymentStatus).optional(),
    semesterId: uuid.optional(),
  }),
});

export const paymentIdSchema = z.object({
  params: z.object({ id: uuid }),
});

export const checkoutSessionSchema = z.object({
  query: z.object({
    session_id: z.string().min(20).max(255),
  }),
});