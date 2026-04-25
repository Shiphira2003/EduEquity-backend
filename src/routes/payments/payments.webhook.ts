import Stripe from "stripe";
import { Request, Response } from "express";
import { db } from "../../db/db";
import { paymentsTable, applicationsTable, notificationsTable } from "../../db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock", {
    apiVersion: "2025-02-24.acacia" as any,
});

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
        const applicationId = session.metadata?.applicationId;
        const userId = session.metadata?.userId;
        const transactionId = session.payment_intent;
        const amount = session.amount_total;

        if (!applicationId || !userId || !transactionId || !amount) {
            console.error("❌ Missing required metadata (applicationId, userId, transactionId, amount)");
            res.status(400).json({ error: "Missing required metadata" }); 
            return; 
        }

        let paymentStatus = "PENDING";
        const stripeStatus = session.payment_status;
        if (stripeStatus === "paid") {
            paymentStatus = "PROCESSED";
        } else if (stripeStatus === "unpaid" || stripeStatus === "Failed") {
            paymentStatus = "FAILED";
        }

        try {
            console.log(`💰 Saving stripe payment for application ${applicationId}`);
            
            // 1. Insert Payment Record
            await db.insert(paymentsTable).values({
                applicationId: Number(applicationId),
                userId: Number(userId),
                amount: (amount / 100).toString(),
                paymentStatus,
                transactionId,
                paymentMethod: "Stripe",
            } as any);

            // 2. Finalize Application state to COMPLETED
            if (paymentStatus === "PROCESSED") {
                await db.update(applicationsTable)
                    .set({ status: 'COMPLETED' as any }) // Force cast for enum compatibility if needed
                    .where(eq(applicationsTable.id, Number(applicationId)));

                // 3. Dispatch Notification to the Student
                await db.insert(notificationsTable).values({
                    userId: Number(userId),
                    message: `Congratulations! Your bursary payment of KES ${(amount / 100)} has successfully completed and processed to your account.`,
                    type: "PAYMENT_COMPLETED",
                    isRead: false
                });

                console.log(`✅ Application ${applicationId} COMPLETED and user notified.`);
            }

        } catch (err) {
            console.error("❌ Failed to process checkout webhook", err);
            res.status(500).json({ error: "Database transaction failed" });
            return;
        }
    }

    res.status(200).json({ received: true });
};
