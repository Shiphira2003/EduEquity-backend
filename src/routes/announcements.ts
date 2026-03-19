import { Router, Request, Response, NextFunction } from "express";
import pool from "../db/db";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";

const router = Router();

// GET /api/announcements (Public / All logged in users)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await pool.query(
            "SELECT a.*, u.email as admin_email FROM announcements a LEFT JOIN users u ON a.created_by = u.id ORDER BY a.created_at DESC"
        );
        res.json(result.rows);
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

        const result = await pool.query(
            "INSERT INTO announcements (title, message, created_by) VALUES ($1, $2, $3) RETURNING *",
            [title, message, userId]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

export default router;
