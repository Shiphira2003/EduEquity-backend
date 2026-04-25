import { Router } from "express";
import {
  createPayment,
  deletePayment,
  getPayments,
  getPaymentById,
  updatePayment,
  createCheckoutSession,
  getPaymentsByUserId
} from "./payments.controller";
import { webhookHandler } from "./payments.webhook";
import express from "express";

export const paymentRouter = Router();

paymentRouter.get("/", getPayments);
paymentRouter.post("/", createPayment);
paymentRouter.get("/user/:userId", getPaymentsByUserId);
paymentRouter.get("/:id", getPaymentById);
paymentRouter.put("/:id", updatePayment);
paymentRouter.delete("/:id", deletePayment);
paymentRouter.post("/checkout-session", createCheckoutSession);

// Webhook needs raw body parsing
paymentRouter.post("/webhook", express.raw({ type: "application/json" }), webhookHandler);
