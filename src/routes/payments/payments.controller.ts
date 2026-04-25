import { Request, Response } from "express";
import {
  createPaymentService,
  deletePaymentService,
  getPaymentByIdService,
  getPaymentsService,
  updatePaymentService,
  getPaymentsByUserIdService
} from "./payments.service";
import Stripe from "stripe";
import { db } from "../../db/db";
import { applicationsTable, studentsTable, usersTable } from "../../db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock", {
  apiVersion: "2025-02-24.acacia" as any, // latest stable typings might differ in version, forcing cast
});

// Get all payments
export const getPayments = async (req: Request, res: Response) => {
  try {
    const payments = await getPaymentsService();
    if (!payments || payments.length === 0) {
      res.status(404).json({ message: "No payments found" });
      return;
    }
    res.status(200).json(payments);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch payments" });
  }
};

// Get a payment by ID
export const getPaymentById = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID format" });
    return;
  }

  try {
    const payment = await getPaymentByIdService(id);
    if (!payment) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }
    res.status(200).json(payment);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch payment" });
  }
};

// Get payments by user ID
export const getPaymentsByUserId = async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId as string);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID format" });
    return;
  }

  try {
    const payments = await getPaymentsByUserIdService(userId);
    if (!payments || payments.length === 0) {
      res.status(404).json({ message: "No payments found for this user" });
      return;
    }
    res.status(200).json(payments);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch user payments" });
  }
};

// Create a payment
export const createPayment = async (req: Request, res: Response) => {
  const {
    applicationId,
    userId,
    amount,
    paymentStatus,
    paymentDate,
    paymentMethod,
    transactionId,
  } = req.body;

  if (applicationId === undefined || amount === undefined || userId === undefined) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const message = await createPaymentService({
      applicationId,
      userId,
      amount: amount.toString(),
      paymentStatus: paymentStatus || 'PENDING',
      paymentDate: paymentDate ? new Date(paymentDate) : undefined,
      paymentMethod,
      transactionId,
    } as any);
    res.status(201).json({ message });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to create payments" });
  }
};

// Update a payment
export const updatePayment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID format" });
    return;
  }

  const {
    applicationId,
    amount,
    paymentStatus,
    paymentDate,
    paymentMethod,
    transactionId,
  } = req.body;

  if (Object.keys(req.body).length === 0) {
    res.status(400).json({ error: "No fields provided for update" });
    return;
  }

  try {
    const message = await updatePaymentService(id, {
      applicationId,
      amount: amount?.toString(),
      paymentStatus,
      paymentDate: paymentDate ? new Date(paymentDate) : undefined,
      paymentMethod,
      transactionId,
    } as any);
    res.status(200).json({ message });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update payments" });
  }
};

// Delete a payment
export const deletePayment = async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID format" });
    return;
  }

  try {
    const existing = await getPaymentByIdService(id);
    if (!existing) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }

    const message = await deletePaymentService(id);
    res.status(200).json({ message });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to delete payments" });
  }
};

// Create Stripe Checkout Session
export const createCheckoutSession = async (req: Request, res: Response) => {
  const { amount, applicationId } = req.body;

  if (!amount || isNaN(amount)) {
    res.status(400).json({ error: 'Invalid input' });
    return;
  }

  try {
    // Lookup user id from application
    const appLookup = await db.select({
      studentUserId: usersTable.id
    })
    .from(applicationsTable)
    .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .where(eq(applicationsTable.id, applicationId));

    if (appLookup.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const userId = appLookup[0].studentUserId;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'kes',
            unit_amount: amount * 100, // Stripe expects lowest denomination
            product_data: {
              name: 'Bursary Payment / Disbursement',
              description: 'Official BursarHub Funding Payment',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        applicationId: applicationId ? String(applicationId) : '',
        userId: userId ? String(userId) : '',
      },
      success_url: 'http://localhost:5173/admin/disbursements',
      cancel_url: 'http://localhost:5173/admin/disbursements',
    });

    res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
