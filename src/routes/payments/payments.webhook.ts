import Stripe from "stripe";
import { Request, Response } from "express";
import { db } from "../../db/db";
import { applicationsTable, usersTable, studentsTable } from "../../db/schema";
import { eq } from "drizzle-orm";
import { reconcilePayment } from "../../services/payment.reconciliation";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock", {
    apiVersion: "2025-02-24.acacia" as any,
});

console.log(`🔌 Payment Webhook initialized with ${process.env.STRIPE_SECRET_KEY ? 'live secret key' : 'MOCK KEY'}`);

export const webhookHandler = async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "whsec_mock";
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } catch (err: any) {
        console.error("⚠ Webhook signature verification failed:", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        const isBulk = session.metadata?.bulk_payment === 'true';
        const transactionId = session.payment_intent;
        const stripeStatus = session.payment_status;

        if (stripeStatus !== "paid") {
            console.log(`Payment status is ${stripeStatus}, skipping reconciliation.`);
            return res.status(200).json({ received: true });
        }

        try {
            if (isBulk) {
                const disbursementIds = (session.metadata?.disbursement_ids || "").split(",");
                const applicationIds = (session.metadata?.application_ids || "").split(",");
                const amounts = (session.metadata?.amounts || "").split(",");

                for (let i = 0; i < disbursementIds.length; i++) {
                    const appId = Number(applicationIds[i]);
                    const disbId = Number(disbursementIds[i]);
                    const amount = amounts[i];

                    // Lookup userId
                    const appLookup = await db.select({ suid: usersTable.id })
                        .from(applicationsTable)
                        .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
                        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
                        .where(eq(applicationsTable.id, appId));

                    if (appLookup.length > 0) {
                        await reconcilePayment(appId, appLookup[0].suid, amount, transactionId, disbId);
                    }
                }
            } else {
                const appId = Number(session.metadata?.applicationId);
                const userId = Number(session.metadata?.userId);
                const disbId = Number(session.metadata?.disbursementId);
                const amount = (session.amount_total / 100).toString();

                await reconcilePayment(appId, userId, amount, transactionId, disbId || undefined);
            }
        } catch (err: any) {
            console.error("❌ Webhook processing error:", err.message);
            return res.status(500).json({ error: "Processing failed" });
        }
    }

    res.status(200).json({ received: true });
};
