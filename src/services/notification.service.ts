import { db } from "../db/db";
import { notificationsTable, usersTable, rolesTable } from "../db/schema";
import { eq } from "drizzle-orm";

/**
 * Notifies all Super Admins of a specific activity.
 */
export const notifySuperAdmins = async (message: string, type: string = "ADMIN_ACTIVITY") => {
    try {
        // 1. Get all Super Admins
        const superAdmins = await db.select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.role, "SUPER_ADMIN"));

        if (superAdmins.length === 0) return;

        // 2. Create notifications for each
        const notifications = superAdmins.map(admin => ({
            userId: admin.id,
            message,
            type,
            isRead: false
        }));

        await db.insert(notificationsTable).values(notifications);
        console.log(`Notified ${superAdmins.length} Super Admins: ${message}`);
    } catch (err) {
        console.error("Failed to notify Super Admins:", err);
    }
};
