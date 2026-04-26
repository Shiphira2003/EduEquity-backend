import { db } from "../db/db";
import { 
    paymentsTable, 
    applicationsTable, 
    notificationsTable, 
    usersTable, 
    studentsTable, 
    disbursementsTable 
} from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Shared logic to finalize a payment and update all related records.
 * Used by both Webhooks and manual verification fallbacks.
 */
export const reconcilePayment = async (
    applicationId: number,
    userId: number,
    amount: string,
    transactionId: string,
    disbursementId?: number
) => {
    // 1. Check if this payment is already recorded to prevent duplicates
    const existing = await db.select()
        .from(paymentsTable)
        .where(eq(paymentsTable.transactionId, transactionId));

    if (existing.length > 0) {
        console.log(`⚠️  Payment ${transactionId} already reconciled. Skipping duplicate.`);
        return;
    }

    console.log(`📝 [Reconcile] Starting reconciliation for App: ${applicationId}, User: ${userId}, Amount: ${amount}`);

    try {
        // 2. Insert Payment Record
        await db.insert(paymentsTable).values({
            applicationId,
            userId,
            amount,
            paymentStatus: "PAID",
            transactionId,
            paymentMethod: "Stripe",
        } as any);
        console.log(`✅ [Reconcile] Inserted payment record.`);

        // 3. Update Application status to COMPLETED
        await db.update(applicationsTable)
            .set({ status: 'COMPLETED' as any })
            .where(eq(applicationsTable.id, applicationId));
        console.log(`✅ [Reconcile] Updated application status to COMPLETED.`);

        // 4. Update Disbursement record to PAID
        if (disbursementId) {
            await db.update(disbursementsTable)
                .set({ 
                    status: 'PAID' as any, 
                    referenceNumber: transactionId,
                    disbursedAt: new Date()
                })
                .where(eq(disbursementsTable.id, Number(disbursementId)));
            console.log(`✅ [Reconcile] Updated disbursement #${disbursementId} to PAID.`);
        }

        // 5. Send notification
        await db.insert(notificationsTable).values({
            userId,
            message: `Congratulations! Your bursary payment of KES ${parseFloat(amount).toLocaleString()} has successfully completed and processed to your account.`,
            type: "PAYMENT_COMPLETED",
            isRead: false
        });
        console.log(`✅ [Reconcile] Sent graduation/payment notification to student.`);

        console.log(`🎊 [Reconcile] FULL RECONCILIATION COMPLETE for App ${applicationId}`);
    } catch (err: any) {
        console.error(`❌ [Reconcile] FAILED during database updates:`, err.message, err.stack);
        throw err;
    }
};
