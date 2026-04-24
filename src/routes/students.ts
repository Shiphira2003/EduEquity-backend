// routes/students.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../db/db";
import { usersTable, studentsTable, rolesTable, notificationsTable } from "../db/schema";
import { eq, count, or } from "drizzle-orm";
import { config } from "../config/config";
import { sendWelcomeEmail } from "../services/email.service";

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
            education_level,
            course,
            year_of_study,
            school_bank_name,
            school_account_number,
            county,
            constituency
        } = req.body;

        if (!email || !password || !full_name || !national_id || !institution || !year_of_study || !education_level || !school_bank_name || !school_account_number || !county || !constituency) {
            return res.status(400).json({ error: "All required student fields must be provided, including regional information" });
        }
        
        if (education_level === "TERTIARY" && !course) {
            return res.status(400).json({ error: "Course is required for tertiary students" });
        }

        // 1. Check if user already exists (prevent 500 on unique constraint violation)
        const existingUsers = await db.select()
            .from(usersTable)
            .where(eq(usersTable.email, email));
        
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: "An account with this email already exists" });
        }

        const existingStudents = await db.select()
            .from(studentsTable)
            .where(eq(studentsTable.nationalId, national_id));
        
        if (existingStudents.length > 0) {
            return res.status(400).json({ error: "An account with this National ID already exists" });
        }

        // 2. Determine role: first user ever → SUPER_ADMIN, everyone else → STUDENT
        const countResult = await db.select({ value: count() }).from(usersTable);
        const userCount = countResult[0].value;
        const roleName = userCount === 0 ? "SUPER_ADMIN" : "STUDENT";

        // 3. Get role ID
        const roleRes = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, roleName));
        if (roleRes.length === 0) {
            return res.status(500).json({ error: `System error: Role ${roleName} not found in database.` });
        }
        const roleId = roleRes[0].id;

        const hashedPassword = await bcrypt.hash(password, 10);

        // 4. Create user
        const userResult = await db.insert(usersTable).values({
            email,
            passwordHash: hashedPassword,
            roleId,
            isActive: true,
            isVerified: true
        }).returning({ id: usersTable.id, email: usersTable.email, roleId: usersTable.roleId });

        const user = userResult[0];

        // 5. Create student profile only for STUDENT role
        let student = null;
        if (roleName === "STUDENT") {
            const studentResult = await db.insert(studentsTable).values({
                userId: user.id,
                fullName: full_name,
                nationalId: national_id,
                institution,
                educationLevel: education_level,
                course: course || null,
                yearOfStudy: year_of_study,
                schoolBankName: school_bank_name,
                schoolAccountNumber: school_account_number,
                county: county,
                constituency: constituency
            }).returning();
            student = studentResult[0];

            // Send welcome email (fire-and-forget)
            sendWelcomeEmail(email, full_name, institution);

            // Notify all admins of the new registration
            const admins = await db.select({ id: usersTable.id })
                .from(usersTable)
                .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
                .where(eq(rolesTable.name, "ADMIN"));

            if (admins.length > 0) {
                const notifications = admins.map(a => ({
                    userId: a.id,
                    message: `New student registered: ${full_name}`,
                    type: 'USER_REGISTERED'
                }));
                if (notifications.length > 0) {
                    await db.insert(notificationsTable).values(notifications);
                }
            }
        }

        // 6. Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: roleName, email: user.email },
            config().jwtSecret,
            { expiresIn: "24h" }
        );

        res.status(201).json({
            message: roleName === "SUPER_ADMIN"
                ? "Admin account created successfully (first user)"
                : "Student registered successfully",
            token,
            user: { id: user.id, email: user.email, role: roleName },
            student
        });
    } catch (err: any) {
        console.error("Registration error:", err);
        res.status(500).json({ error: "Internal server error during registration", details: err.message });
    }
});

// GET: Current student profile
router.get("/profile", async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, config().jwtSecret) as any;

        const result = await db.select({
            id: studentsTable.id,
            fullName: studentsTable.fullName,
            nationalId: studentsTable.nationalId,
            institution: studentsTable.institution,
            educationLevel: studentsTable.educationLevel,
            course: studentsTable.course,
            yearOfStudy: studentsTable.yearOfStudy,
            schoolBankName: studentsTable.schoolBankName,
            schoolAccountNumber: studentsTable.schoolAccountNumber,
            county: studentsTable.county,
            constituency: studentsTable.constituency,
            isBankLocked: studentsTable.isBankLocked,
            familyIncome: studentsTable.familyIncome,
            dependents: studentsTable.dependents,
            orphaned: studentsTable.orphaned,
            disabled: studentsTable.disabled,
            academicScore: studentsTable.academicScore,
            email: usersTable.email
        })
        .from(studentsTable)
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(eq(studentsTable.userId, decoded.userId));

        if (result.length === 0) return res.status(404).json({ error: "Student profile not found" });
        res.json(result[0]);
    } catch (err) {
        res.status(401).json({ error: "Invalid token" });
    }
});

// PUT: Update student profile
router.put("/profile", async (req: Request, res: Response) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, config().jwtSecret) as any;

        const {
            fullName,
            nationalId,
            institution,
            educationLevel,
            course,
            yearOfStudy,
            schoolBankName,
            schoolAccountNumber,
            county,
            constituency,
            familyIncome,
            dependents,
            orphaned,
            disabled,
            academicScore
        } = req.body;

        const existing = await db.select({ id: studentsTable.id, isBankLocked: studentsTable.isBankLocked })
            .from(studentsTable)
            .where(eq(studentsTable.userId, decoded.userId));

        if (existing.length === 0) return res.status(404).json({ error: "Profile not found" });

        const updateData: any = {
            fullName,
            nationalId,
            institution,
            educationLevel,
            course,
            yearOfStudy,
            county,
            constituency,
            familyIncome,
            dependents,
            orphaned,
            disabled,
            academicScore
        };

        // Bank details can only be updated if not locked
        if (!existing[0].isBankLocked) {
            if (schoolBankName) updateData.schoolBankName = schoolBankName;
            if (schoolAccountNumber) updateData.schoolAccountNumber = schoolAccountNumber;
        }

        const updated = await db.update(studentsTable)
            .set(updateData)
            .where(eq(studentsTable.userId, decoded.userId))
            .returning();

        res.json(updated[0]);
    } catch (err) {
        res.status(500).json({ error: "Failed to update profile" });
    }
});

export default router;
