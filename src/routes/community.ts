import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { adminCommunityMessagesTable, usersTable, adminsTable } from "../db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";

const router = Router();

// GET /api/community
// Fetch messages (only for ADMIN)
router.get("/", authMiddleware, roleMiddleware("ADMIN"), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const result = await db.select({
            id: adminCommunityMessagesTable.id,
            message: adminCommunityMessagesTable.message,
            createdAt: adminCommunityMessagesTable.createdAt,
            userId: adminCommunityMessagesTable.userId,
            email: usersTable.email,
            systemId: adminsTable.systemId,
            fullName: adminsTable.fullName,
        })
        .from(adminCommunityMessagesTable)
        .leftJoin(usersTable, eq(adminCommunityMessagesTable.userId, usersTable.id))
        .leftJoin(adminsTable, eq(adminCommunityMessagesTable.userId, adminsTable.userId))
        .orderBy(desc(adminCommunityMessagesTable.createdAt))
        .limit(100);

        // Reverse to display chronologically in the chat
        res.json(result.reverse());
    } catch (err) {
        next(err);
    }
});

// POST /api/community
// Send a new message (only for ADMIN)
router.post("/", authMiddleware, roleMiddleware("ADMIN"), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { message } = req.body;
        const userId = req.user!.userId;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: "Message content is required" });
        }

        const inserted = await db.insert(adminCommunityMessagesTable).values({
            userId,
            message,
        }).returning();

        res.status(201).json(inserted[0]);
    } catch (err) {
        next(err);
    }
});

export default router;
