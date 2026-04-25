import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/db";
import { paymentsTable, applicationsTable, TPaymentInsert, TPaymentSelect } from "../../db/schema";

export const getPaymentsService = async (): Promise<TPaymentSelect[]> => {
    return await db.select().from(paymentsTable).orderBy(desc(paymentsTable.createdAt));
};

export const getPaymentByIdService = async (id: number): Promise<TPaymentSelect | undefined> => {
    const result = await db.select().from(paymentsTable).where(eq(paymentsTable.id, id));
    return result[0];
};

export const createPaymentService = async (data: TPaymentInsert): Promise<string> => {
    await db.insert(paymentsTable).values(data).returning();
    return "Payment created successfully 💰";
};

export const updatePaymentService = async (id: number, data: Partial<TPaymentInsert>): Promise<string> => {
    await db.update(paymentsTable).set(data).where(eq(paymentsTable.id, id));
    return "Payment updated successfully 🛠️";
};

export const deletePaymentService = async (id: number): Promise<string> => {
    await db.delete(paymentsTable).where(eq(paymentsTable.id, id));
    return "Payment deleted successfully 🗑️";
};

// Get payments by userId
export const getPaymentsByUserIdService = async (userId: number): Promise<TPaymentSelect[]> => {
    return await db.select()
        .from(paymentsTable)
        .where(eq(paymentsTable.userId, userId))
        .orderBy(desc(paymentsTable.createdAt));
};
