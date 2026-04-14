// routes/register.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import { db } from "../db/db";
import { usersTable, studentsTable, rolesTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { roleMiddleware } from "../middleware/role.middleware";

const router = Router();

const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Increased for dev
    message: { error: "Too many registrations, please try again later" },
});

// -------------------- POST: Admin registers user --------------------
router.post("/", roleMiddleware("admin"), registerLimiter, async (req: Request, res: Response) => {
    try {
        const { email, password, role, full_name, national_id, institution, education_level, course, year_of_study } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({ error: "Email, password, and role are required" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const roleResult = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, role.toUpperCase()));
        if (roleResult.length === 0) {
            return res.status(400).json({ error: `Role ${role.toUpperCase()} not found` });
        }
        const roleId = roleResult[0].id;

        const userResult = await db.insert(usersTable).values({
            email,
            passwordHash: hashedPassword,
            roleId,
            isActive: true
        }).returning({
            id: usersTable.id,
            email: usersTable.email,
            roleId: usersTable.roleId
        });

        const user = userResult[0];

        let student = null;
        if (role.toUpperCase() === "STUDENT") {
            if (!full_name || !national_id || !institution || !year_of_study || !education_level) {
                return res.status(400).json({ error: "Missing student fields for STUDENT role" });
            }
            if (education_level === "TERTIARY" && !course) {
                return res.status(400).json({ error: "Course is required for tertiary students" });
            }

            const studentResult = await db.insert(studentsTable).values({
                userId: user.id,
                fullName: full_name,
                nationalId: national_id,
                institution,
                educationLevel: education_level,
                course: course || null,
                yearOfStudy: year_of_study
            }).returning();

            student = studentResult[0];
        }

        res.status(201).json({
            message: "User registered successfully",
            user,
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

export default router;
