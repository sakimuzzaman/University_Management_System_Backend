import Stripe from "stripe";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { getStripe } from "../../config/stripe";
import { ApiError } from "../../utils/ApiError";
import { getPagination, pageMeta } from "../../utils/pagination";
import { writeAudit } from "../../utils/audit";
import { PaymentStatus, Role } from "../../generated/prisma/enums";
import { Prisma } from "../../generated/prisma/client";

type Actor = { id: string; role: Role };
type PageQuery = { page?: number; limit?: number };

const paymentSelect = {
  id: true,
  userId: true,
  semesterId: true,
  amount: true,
  currency: true,
  status: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  semester: {
    select: { id: true, name: true, code: true, status: true },
  },
} satisfies Prisma.PaymentSelect;

function intentIdOf(value: string | Stripe.PaymentIntent | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/* --------------------------- Initiate payment ------------------------- */

export async function initiatePayment(
  input: { semesterId: string },
  actor: Actor,
  ipAddress?: string,
) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId: actor.id },
    select: { id: true },
  });
  if (!student) throw new ApiError(409, "Complete your student profile before paying tuition");

  const semester = await prisma.semester.findFirst({
    where: { id: input.semesterId, deletedAt: null },
  });
  if (!semester) throw new ApiError(404, "Semester not found");
  if (semester.status === "COMPLETED") {
    throw new ApiError(409, "This semester is already completed");
  }

  const existing = await prisma.payment.findUnique({
    where: {
      userId_semesterId: { userId: actor.id, semesterId: semester.id },
    },
  });
  if (existing?.status === PaymentStatus.SUCCEEDED) {
    throw new ApiError(409, "Tuition for this semester is already paid");
  }

  if (!env.STRIPE_SECRET_KEY) throw new ApiError(500, "Stripe is not configured");
  if (!env.STRIPE_SUCCESS_URL || !env.STRIPE_CANCEL_URL) {
    throw new ApiError(500, "Payment redirect URLs are not configured");
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { email: true },
  });
  if (!user) throw new ApiError(404, "User not found");

  // Reserve the payment row first. The unique [userId, semesterId] constraint
  // means concurrent initiates converge on the same row instead of creating
  // duplicate payment records.
  const paymentRow = await prisma.payment.upsert({
    where: {
      userId_semesterId: { userId: actor.id, semesterId: semester.id },
    },
    create: {
      userId: actor.id,
      semesterId: semester.id,
      amount: semester.tuitionFee,
      status: PaymentStatus.PENDING,
    },
    update: {
      status: PaymentStatus.PENDING,
      amount: semester.tuitionFee,
    },
    select: { id: true },
  });

  const amountCents = Math.round(Number(semester.tuitionFee) * 100);

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: paymentRow.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Tuition — ${semester.name} (${semester.code})`,
              description: `Semester tuition payment for ${semester.name}`,
            },
          },
        },
      ],
      metadata: {
        paymentId: paymentRow.id,
        userId: actor.id,
        semesterId: semester.id,
      },
      success_url: env.STRIPE_SUCCESS_URL,
      cancel_url: env.STRIPE_CANCEL_URL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    throw new ApiError(502, `Stripe rejected the checkout session: ${message}`);
  }

  await prisma.payment.update({
    where: { id: paymentRow.id },
    data: { stripeCheckoutSessionId: session.id },
  });

  await writeAudit({
    actorId: actor.id,
    action: "INITIATE_PAYMENT",
    entity: "Payment",
    entityId: paymentRow.id,
    ipAddress,
    metadata: {
      semesterId: semester.id,
      amount: Number(semester.tuitionFee),
      stripeSessionId: session.id,
    },
  });

  return {
    paymentId: paymentRow.id,
    semester: { id: semester.id, name: semester.name, code: semester.code },
    amount: Number(semester.tuitionFee),
    currency: "usd",
    status: PaymentStatus.PENDING,
    checkoutUrl: session.url,
    checkoutSessionId: session.id,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
  };
}

/* ------------------------------ Webhook ------------------------------- */

async function findPaymentBySession(session: Stripe.Checkout.Session) {
  const bySessionId = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: session.id },
  });
  if (bySessionId) return bySessionId;

  const paymentId = session.metadata?.paymentId;
  if (!paymentId) return null;
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

async function transitionPayment(options: {
  paymentId: string;
  from: PaymentStatus[];
  to: PaymentStatus;
  stripePaymentIntentId?: string | null;
  eventType: string;
}) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({
      where: { id: options.paymentId },
    });
    if (!current) {
      return { paymentId: options.paymentId, changed: false, reason: "payment not found" };
    }

    // Idempotency: Stripe retries deliveries. A repeated event for a payment
    // that is already in the target state is acknowledged without changes.
    if (current.status === options.to) {
      return { paymentId: options.paymentId, changed: false, reason: "already processed" };
    }
    if (!options.from.includes(current.status)) {
      return {
        paymentId: options.paymentId,
        changed: false,
        reason: `ignored transition ${current.status} → ${options.to}`,
      };
    }

    await tx.payment.update({
      where: { id: options.paymentId },
      data: {
        status: options.to,
        paidAt: options.to === PaymentStatus.SUCCEEDED ? new Date() : current.paidAt,
        stripePaymentIntentId:
          options.stripePaymentIntentId ?? current.stripePaymentIntentId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: `PAYMENT_${options.to}`,
        entity: "Payment",
        entityId: options.paymentId,
        metadata: {
          source: "stripe_webhook",
          eventType: options.eventType,
        },
      },
    });

    return {
      paymentId: options.paymentId,
      changed: true,
      previousStatus: current.status,
      status: options.to,
    };
  });
}

export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await findPaymentBySession(session);
      if (!payment) {
        return { handled: false, reason: "No payment matches this checkout session" };
      }

      if (session.payment_status === "paid") {
        return transitionPayment({
          paymentId: payment.id,
          from: [PaymentStatus.PENDING, PaymentStatus.FAILED],
          to: PaymentStatus.SUCCEEDED,
          stripePaymentIntentId: intentIdOf(session.payment_intent),
          eventType: event.type,
        });
      }

      // Async payment method (e.g. bank debit) is still processing.
      // Wait for async_payment_succeeded / async_payment_failed.
      return {
        handled: true,
        changed: false,
        reason: "Checkout completed but payment is still processing",
      };
    }

    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await findPaymentBySession(session);
      if (!payment) {
        return { handled: false, reason: "No payment matches this checkout session" };
      }
      return transitionPayment({
        paymentId: payment.id,
        from: [PaymentStatus.PENDING],
        to: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: intentIdOf(session.payment_intent),
        eventType: event.type,
      });
    }

    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await findPaymentBySession(session);
      if (!payment) {
        return { handled: false, reason: "No payment matches this checkout session" };
      }
      return transitionPayment({
        paymentId: payment.id,
        from: [PaymentStatus.PENDING],
        to: PaymentStatus.FAILED,
        eventType: event.type,
      });
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await findPaymentBySession(session);
      if (!payment) {
        return { handled: false, reason: "No payment matches this checkout session" };
      }
      return transitionPayment({
        paymentId: payment.id,
        from: [PaymentStatus.PENDING],
        to: PaymentStatus.CANCELED,
        eventType: event.type,
      });
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId = intentIdOf(charge.payment_intent);
      if (!intentId) return { handled: false, reason: "Charge has no payment intent" };

      const payment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: intentId },
      });
      if (!payment) {
        return { handled: false, reason: "No payment matches this payment intent" };
      }
      return transitionPayment({
        paymentId: payment.id,
        from: [PaymentStatus.SUCCEEDED],
        to: PaymentStatus.REFUNDED,
        eventType: event.type,
      });
    }

    default:
      return { handled: false, reason: `Unhandled event type: ${event.type}` };
  }
}

/* --------------------------- Status tracking -------------------------- */

export async function listMyPayments(
  userId: string,
  query: PageQuery & { status?: PaymentStatus; semesterId?: string },
) {
  const { page, limit, skip } = getPagination(query);
  const where: Prisma.PaymentWhereInput = {
    userId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.semesterId ? { semesterId: query.semesterId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: paymentSelect,
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    items: items.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
    meta: pageMeta(total, page, limit),
  };
}

export async function getPayment(id: string, actor: Actor) {
  const payment = await prisma.payment.findFirst({
    where: { id },
    select: {
      ...paymentSelect,
      stripeCheckoutSessionId: true,
      stripePaymentIntentId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!payment) throw new ApiError(404, "Payment not found");

  if (actor.role !== Role.ADMIN && payment.userId !== actor.id) {
    throw new ApiError(403, "You can only view your own payments");
  }

  return { ...payment, amount: Number(payment.amount) };
}

export async function getCheckoutResult(sessionId: string) {
  const payment = await prisma.payment.findUnique({
    where: { stripeCheckoutSessionId: sessionId },
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      semester: { select: { name: true, code: true } },
    },
  });
  if (!payment) throw new ApiError(404, "No payment matches this checkout session");

  return {
    ...payment,
    amount: Number(payment.amount),
    note:
      payment.status === PaymentStatus.PENDING
        ? "Stripe received the payment. The webhook is verifying it — check again in a few seconds."
        : undefined,
  };
}

/* ------------------------------- Cancel ------------------------------- */

export async function cancelPayment(id: string, actor: Actor, ipAddress?: string) {
  const payment = await prisma.payment.findFirst({ where: { id } });
  if (!payment) throw new ApiError(404, "Payment not found");
  if (payment.userId !== actor.id) {
    throw new ApiError(403, "You can only cancel your own payment");
  }
  if (payment.status !== PaymentStatus.PENDING) {
    throw new ApiError(409, "Only pending payments can be canceled");
  }

  if (payment.stripeCheckoutSessionId) {
    try {
      await getStripe().checkout.sessions.expire(payment.stripeCheckoutSessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stripe error";
      // A session that already expired can never move money — safe to cancel.
      if (!/already expired/i.test(message)) {
        throw new ApiError(409, `Could not cancel the checkout session: ${message}`);
      }
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.CANCELED },
    });
    if (updated.count !== 1) throw new ApiError(409, "Payment is no longer pending");

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CANCEL_PAYMENT",
        entity: "Payment",
        entityId: id,
        ipAddress: ipAddress ?? null,
        metadata: { source: "api" },
      },
    });

    const result = await tx.payment.findUniqueOrThrow({
      where: { id },
      select: paymentSelect,
    });
    return { ...result, amount: Number(result.amount) };
  });
}

/* ------------------------------- Refund ------------------------------- */

export async function refundPayment(id: string, actor: Actor, ipAddress?: string) {
  const payment = await prisma.payment.findFirst({ where: { id } });
  if (!payment) throw new ApiError(404, "Payment not found");
  if (payment.status !== PaymentStatus.SUCCEEDED) {
    throw new ApiError(409, "Only succeeded payments can be refunded");
  }
  if (!payment.stripePaymentIntentId) {
    throw new ApiError(409, "Payment has no Stripe payment intent");
  }

  let refund: Stripe.Refund;
  try {
    refund = await getStripe().refunds.create({
      payment_intent: payment.stripePaymentIntentId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe error";
    throw new ApiError(502, `Stripe refund failed: ${message}`);
  }

  if (refund.status !== "succeeded") {
    return {
      paymentId: id,
      refundId: refund.id,
      refundStatus: refund.status,
      note: "Refund is processing; status will update via the charge.refunded webhook",
    };
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id, status: PaymentStatus.SUCCEEDED },
      data: { status: PaymentStatus.REFUNDED },
    });
    if (updated.count !== 1) {
      throw new ApiError(409, "Payment status changed during refund");
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "REFUND_PAYMENT",
        entity: "Payment",
        entityId: id,
        ipAddress: ipAddress ?? null,
        metadata: { refundId: refund.id, source: "api" },
      },
    });

    return {
      paymentId: id,
      refundId: refund.id,
      refundStatus: refund.status,
      status: PaymentStatus.REFUNDED,
    };
  });
}