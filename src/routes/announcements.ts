import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { announcementsTable, usersTable, adminsTable } from "../db/schema";
import { eq, desc, or } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import { notifySuperAdmins } from "../services/notification.service";

const router = Router();

// GET /api/announcements
router.get("/", authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userRole = req.user?.role?.toUpperCase();
        
        // Define what each role can see
        let filters = [eq(announcementsTable.targetAudience, 'STUDENTS')]; // everyone sees student announcements (public/global)
        if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
            filters.push(eq(announcementsTable.targetAudience, 'ADMINS'));
        }

        const result = await db.select({
            id: announcementsTable.id,
            title: announcementsTable.title,
            message: announcementsTable.message,
            targetAudience: announcementsTable.targetAudience,
            createdBy: announcementsTable.createdBy,
            created_at: announcementsTable.createdAt,
            admin_email: usersTable.email,
            system_id: adminsTable.systemId,
        })
        .from(announcementsTable)
        .leftJoin(usersTable, eq(announcementsTable.createdBy, usersTable.id))
        .leftJoin(adminsTable, eq(announcementsTable.createdBy, adminsTable.userId))
        .where(or(...filters))
        .orderBy(desc(announcementsTable.createdAt));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// POST /api/announcements (Admin & Super Admin)
router.post("/", authMiddleware, roleMiddleware("admin", "super_admin"), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, message } = req.body;
        const userId = req.user!.userId;
        const userRole = req.user?.role?.toUpperCase();

        if (!title || !message) {
            return res.status(400).json({ error: "Title and message are required" });
        }
        
        const finalAudience = userRole === 'SUPER_ADMIN' ? 'ADMINS' : 'STUDENTS';

        const result = await db.insert(announcementsTable).values({
            title,
            message,
            targetAudience: finalAudience,
            createdBy: userId,
        }).returning();

        // Notify Super Admin
        const adminEmail = (req.user as any)?.email || 'An Admin';
        notifySuperAdmins(`${adminEmail} posted a new announcement: "${title}"`);

        res.status(201).json(result[0]);
    } catch (err) {
        next(err);
    }
});

export default router;
