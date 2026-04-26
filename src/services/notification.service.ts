import { db } from "../db/db";
import { notificationsTable, usersTable } from "../db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Broadcasts a notification to multiple user roles.
 */
export const broadcastNotification = async (message: string, roles: ("ADMIN" | "STUDENT" | "COMMITTEE" | "SUPER_ADMIN")[], type: string = "SYSTEM_ANNOUNCEMENT") => {
    try {
        // 1. Get all users with the specified roles
        const users = await db.select({ id: usersTable.id })
            .from(usersTable)
            .where(inArray(usersTable.role, roles));

        if (users.length === 0) return;

        // 2. Create notifications for each
        const notifications = users.map(user => ({
            userId: user.id,
            message,
            type,
            isRead: false
        }));

        // Insert in chunks if there are many users to avoid DB limits
        const chunkSize = 500;
        for (let i = 0; i < notifications.length; i += chunkSize) {
            const chunk = notifications.slice(i, i + chunkSize);
            await db.insert(notificationsTable).values(chunk);
        }
        
        console.log(`📢 Broadcasted notification to ${users.length} users across roles [${roles.join(', ')}]: ${message}`);
    } catch (err) {
        console.error("❌ Failed to broadcast notification:", err);
    }
};

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
