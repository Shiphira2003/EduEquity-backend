import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { announcementsTable, usersTable, adminsTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";

const router = Router();

// GET /api/announcements (Public / All logged in users)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db.select({
            id: announcementsTable.id,
            title: announcementsTable.title,
            message: announcementsTable.message,
            createdBy: announcementsTable.createdBy,
            created_at: announcementsTable.createdAt,
            admin_email: usersTable.email,
            system_id: adminsTable.systemId,
        })
        .from(announcementsTable)
        .leftJoin(usersTable, eq(announcementsTable.createdBy, usersTable.id))
        .leftJoin(adminsTable, eq(announcementsTable.createdBy, adminsTable.userId))
        .orderBy(desc(announcementsTable.createdAt));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// POST /api/announcements (Admin only)
router.post("/", authMiddleware, roleMiddleware("admin"), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { title, message } = req.body;
        const userId = req.user!.userId;

        if (!title || !message) {
            return res.status(400).json({ error: "Title and message are required" });
        }

        const result = await db.insert(announcementsTable).values({
            title,
            message,
            createdBy: userId,
        }).returning();

        res.status(201).json(result[0]);
    } catch (err) {
        next(err);
    }
});

export default router;
