// routes/students.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db/db";
import { config } from "../config/config";

const router = Router();

// -------------------- POST: Self-register student --------------------
// First user to register becomes ADMIN; all subsequent users become STUDENT.
router.post("/register/student", async (req: Request, res: Response) => {
    try {
        const {
            email,
            password,
            full_name,
            national_id,
            institution,
            course,
            year_of_study,
        } = req.body;

        if (!email || !password || !full_name || !national_id || !institution || !course || !year_of_study) {
            return res.status(400).json({ error: "All student fields are required" });
        }

        // Determine role: first user ever → ADMIN, everyone else → STUDENT
        const countResult = await pool.query("SELECT COUNT(*) FROM users");
        const userCount = parseInt(countResult.rows[0].count, 10);
        const roleName = userCount === 0 ? "ADMIN" : "STUDENT";

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user with the determined role
        const userResult = await pool.query(
            `INSERT INTO users (email, password_hash, role_id)
             SELECT $1, $2, id FROM roles WHERE name = $3
             RETURNING id, email, role_id`,
            [email, hashedPassword, roleName]
        );

        const user = userResult.rows[0];

        // Only create a student profile for STUDENT role users
        let student = null;
        if (roleName === "STUDENT") {
            const studentResult = await pool.query(
                `INSERT INTO students
                 (user_id, full_name, national_id, institution, course, year_of_study)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, user_id, full_name, national_id, institution, course, year_of_study, created_at`,
                [user.id, full_name, national_id, institution, course, year_of_study]
            );
            student = studentResult.rows[0];

            // Notify all admins of the new registration
            await pool.query(
                `INSERT INTO notifications (user_id, message, type)
                 SELECT u.id, $1, 'USER_REGISTERED'
                 FROM users u JOIN roles r ON u.role_id = r.id WHERE r.name = 'ADMIN'`,
                [`New student registered: ${full_name}`]
            );
        }

        // Generate JWT so the user is immediately logged in
        const token = jwt.sign(
            { userId: user.id, role: roleName, email: user.email },
            config().jwtSecret,
            { expiresIn: "24h" }
        );

        res.status(201).json({
            message: roleName === "ADMIN"
                ? "Admin account created successfully (first user)"
                : "Student registered successfully",
            token,
            user: { id: user.id, email: user.email, role: roleName },
            student,
        });

    } catch (err: any) {
        console.error(err);
        if (err.code === "23505") {
            return res.status(400).json({ error: "Email or National ID already exists" });
        }
        res.status(500).json({ error: "Server error" });
    }
});

import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";

// -------------------- GET: Get Student Profile --------------------
router.get("/profile", authMiddleware, roleMiddleware("student"), async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        const result = await pool.query(
            `SELECT * FROM students WHERE user_id = $1`,
            [userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Profile not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// -------------------- PUT: Update Student Profile --------------------
router.put("/profile", authMiddleware, roleMiddleware("student"), async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const { full_name, institution, course, year_of_study } = req.body;

        const result = await pool.query(
            `UPDATE students
             SET full_name = COALESCE($1, full_name),
                 institution = COALESCE($2, institution),
                 course = COALESCE($3, course),
                 year_of_study = COALESCE($4, year_of_study)
             WHERE user_id = $5
             RETURNING *`,
            [full_name, institution, course, year_of_study, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Profile not found" });
        }

        res.json({
            message: "Profile updated successfully",
            student: result.rows[0]
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;
