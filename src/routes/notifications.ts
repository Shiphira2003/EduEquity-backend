import { Router, Response, NextFunction } from "express";
import { db } from "../db/db";
import { notificationsTable } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

// GET /api/notifications
router.get("/", async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;

        const result = await db.select()
            .from(notificationsTable)
            .where(eq(notificationsTable.userId, userId))
            .orderBy(desc(notificationsTable.createdAt));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const rawId = req.params.id;
        const idParam = Array.isArray(rawId) ? rawId[0] : rawId;
        const id = parseInt(idParam, 10);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: "Invalid notification id" });
        }

        const result = await db.update(notificationsTable)
            .set({ isRead: true })
            .where(and(
                eq(notificationsTable.id, id),
                eq(notificationsTable.userId, userId)
            ))
            .returning();

        if (result.length === 0) {
            return res.status(404).json({ error: "Notification not found" });
        }

        res.json(result[0]);
    } catch (err) {
        next(err);
    }
});

export default router;
