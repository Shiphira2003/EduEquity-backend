import { Router, Request, Response, NextFunction } from "express";
import pool from "../db/db";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

// GET /api/notifications
router.get("/", async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const result = await pool.query(
            "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
            [userId]
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;
        const result = await pool.query(
            "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Notification not found" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

export default router;
