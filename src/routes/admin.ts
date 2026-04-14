import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import {
    usersTable,
    studentsTable,
    applicationsTable,
    auditLogsTable,
    disbursementsTable,
    adminsTable,
    rolesTable,
} from "../db/schema";
import { eq, count, desc, sum } from "drizzle-orm";
import { upload } from "../middleware/upload";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import { sendDisbursementCompletedEmail } from "../services/email.service";

const router = Router();

// Apply auth and admin role to all routes in this file
router.use(authMiddleware, roleMiddleware("admin", "SUPER_ADMIN"));

// ─────────────────────────────────────────────
// 1. GET /api/admin/profile
// ─────────────────────────────────────────────
router.get("/profile", async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;

        const result = await db.select({
            id: adminsTable.id,
            userId: adminsTable.userId,
            fullName: adminsTable.fullName,
            idNumber: adminsTable.idNumber,
            imageIcon: adminsTable.imageIcon,
            email: usersTable.email,
        })
        .from(adminsTable)
        .innerJoin(usersTable, eq(adminsTable.userId, usersTable.id))
        .where(eq(adminsTable.userId, userId));

        if (result.length === 0) {
            const userResult = await db.select({ email: usersTable.email })
                .from(usersTable)
                .where(eq(usersTable.id, userId));
            return res.json({ email: userResult[0]?.email });
        }

        res.json(result[0]);
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// 2. PUT /api/admin/profile
// ─────────────────────────────────────────────
router.put("/profile", upload.single("image_icon"), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { full_name, id_number } = req.body;
        const file = req.file;

        const existing = await db.select()
            .from(adminsTable)
            .where(eq(adminsTable.userId, userId));

        let imageUrl: string | null = existing[0]?.imageIcon ?? null;
        if (file) {
            imageUrl = file.path;
        } else if (req.body.avatar) {
            imageUrl = req.body.avatar;
        }
        
        const fullNameData = full_name || existing[0]?.fullName;
        const idNumberData = id_number || existing[0]?.idNumber;

        if (existing.length === 0) {
            if (!full_name) {
                return res.status(400).json({ error: "full_name is required for new admin profile" });
            }
            const inserted = await db.insert(adminsTable).values({
                userId,
                fullName: full_name,
                idNumber: id_number ?? null,
                imageIcon: imageUrl,
            }).returning();
            return res.json(inserted[0]);
        } else {
            const updated = await db.update(adminsTable)
                .set({
                    fullName: fullNameData,
                    idNumber: idNumberData,
                    imageIcon: imageUrl,
                })
                .where(eq(adminsTable.userId, userId))
                .returning();
            return res.json(updated[0]);
        }
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// 3. GET /api/admin/analytics
// ─────────────────────────────────────────────
router.get("/analytics", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const [studentsCount] = await db.select({ value: count() }).from(studentsTable);
        const [applicationsCount] = await db.select({ value: count() }).from(applicationsTable);
        const [pendingCount] = await db.select({ value: count() }).from(applicationsTable)
            .where(eq(applicationsTable.status, "PENDING"));
        const [disbursedResult] = await db.select({
            total: sum(applicationsTable.amountAllocated)
        }).from(applicationsTable).where(eq(applicationsTable.status, "APPROVED"));
        const [auditCount] = await db.select({ value: count() }).from(auditLogsTable);

        res.json({
            total_students: studentsCount.value,
            total_applications: applicationsCount.value,
            pending_applications: pendingCount.value,
            total_disbursed: parseFloat(disbursedResult.total ?? "0"),
            total_audit_logs: auditCount.value,
        });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// 4. GET /api/admin/students  (paginated)
// ─────────────────────────────────────────────
router.get("/students", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = (page - 1) * limit;

        const [totalResult] = await db.select({ value: count() }).from(studentsTable);
        const total = totalResult.value;

        const result = await db.select({
            id: studentsTable.id,
            userId: studentsTable.userId,
            fullName: studentsTable.fullName,
            nationalId: studentsTable.nationalId,
            institution: studentsTable.institution,
            educationLevel: studentsTable.educationLevel,
            course: studentsTable.course,
            yearOfStudy: studentsTable.yearOfStudy,
            schoolBankName: studentsTable.schoolBankName,
            schoolAccountNumber: studentsTable.schoolAccountNumber,
            isBankLocked: studentsTable.isBankLocked,
            createdAt: studentsTable.createdAt,
            email: usersTable.email,
        })
        .from(studentsTable)
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .orderBy(desc(studentsTable.createdAt))
        .limit(limit)
        .offset(offset);

        res.json({
            data: result.map(s => ({
                id: s.id,
                user_id: s.userId,
                full_name: s.fullName,
                national_id: s.nationalId,
                institution: s.institution,
                education_level: s.educationLevel,
                course: s.course,
                year_of_study: s.yearOfStudy,
                school_bank_name: s.schoolBankName,
                school_account_number: s.schoolAccountNumber,
                is_bank_locked: s.isBankLocked,
                created_at: s.createdAt,
                email: s.email,
            })),
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// 5. GET /api/admin/audit-logs
// ─────────────────────────────────────────────
router.get("/audit-logs", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = db.select({
            id: auditLogsTable.id,
            user_id: auditLogsTable.userId,
            application_id: auditLogsTable.applicationId,
            action: auditLogsTable.action,
            old_value: auditLogsTable.oldValue,
            new_value: auditLogsTable.newValue,
            created_at: auditLogsTable.createdAt,
            admin_email: usersTable.email,
            admin_role: rolesTable.name,
            system_id: adminsTable.systemId
        })
        .from(auditLogsTable)
        .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
        .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .leftJoin(adminsTable, eq(auditLogsTable.userId, adminsTable.userId))
        .orderBy(desc(auditLogsTable.createdAt));

        // If SUPER_ADMIN, filter strictly for actions taken by ADMINS
        if ((req as any).user?.role === 'SUPER_ADMIN') {
            query.where(eq(rolesTable.name, 'ADMIN'));
        }

        const logs = await query;
        res.json(logs);
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// 6. GET /api/admin/disbursements
// ─────────────────────────────────────────────
router.get("/disbursements", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db.select({
            id: disbursementsTable.id,
            allocation_id: disbursementsTable.allocationId,
            amount: disbursementsTable.amount,
            status: disbursementsTable.status,
            reference_number: disbursementsTable.referenceNumber,
            fund_source: disbursementsTable.fundSource,
            disbursed_at: disbursementsTable.disbursedAt,
            created_at: disbursementsTable.createdAt,
            student_id: applicationsTable.studentId,
            student_name: studentsTable.fullName,
        })
        .from(disbursementsTable)
        .innerJoin(applicationsTable, eq(disbursementsTable.allocationId, applicationsTable.id))
        .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
        .orderBy(desc(disbursementsTable.createdAt));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// 7. GET /api/admin/users
// ─────────────────────────────────────────────
router.get("/users", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db.select({
            id: usersTable.id,
            email: usersTable.email,
            role: rolesTable.name,
            isActive: usersTable.isActive,
            isVerified: usersTable.isVerified,
            createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .orderBy(desc(usersTable.createdAt));

        res.json(result);
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// CRUD: Students
// ─────────────────────────────────────────────

// PUT /api/admin/students/:id
router.put("/students/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        const { full_name, institution, course, year_of_study, national_id, school_bank_name, school_account_number, is_bank_locked } = req.body;

        const existing = await db.select({ id: studentsTable.id })
            .from(studentsTable)
            .where(eq(studentsTable.id, id));

        if (existing.length === 0) return res.status(404).json({ error: "Student not found" });

        const updateData: Record<string, any> = {};
        if (full_name !== undefined) updateData.fullName = full_name;
        if (institution !== undefined) updateData.institution = institution;
        if (course !== undefined) updateData.course = course;
        if (year_of_study !== undefined) updateData.yearOfStudy = year_of_study;
        if (national_id !== undefined) updateData.nationalId = national_id;
        if (school_bank_name !== undefined) updateData.schoolBankName = school_bank_name;
        if (school_account_number !== undefined) updateData.schoolAccountNumber = school_account_number;
        if (is_bank_locked !== undefined) updateData.isBankLocked = is_bank_locked;

        const updated = await db.update(studentsTable)
            .set(updateData)
            .where(eq(studentsTable.id, id))
            .returning();

        res.json(updated[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/students/:id
router.delete("/students/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id as string, 10);

        const student = await db.select({ userId: studentsTable.userId })
            .from(studentsTable)
            .where(eq(studentsTable.id, id));

        if (student.length === 0) return res.status(404).json({ error: "Student not found" });

        // CASCADE on usersTable will delete student record too via FK constraint
        await db.delete(usersTable).where(eq(usersTable.id, student[0].userId));

        res.json({ success: true, message: "Student and user account deleted" });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// CRUD: Applications
// ─────────────────────────────────────────────

// POST /api/admin/applications
router.post("/applications", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { student_id, cycle_year, amount_requested } = req.body;

        const inserted = await db.insert(applicationsTable).values({
            studentId: student_id,
            cycleYear: parseInt(cycle_year, 10),
            amountRequested: amount_requested.toString(),
            documentUrl: "[]",
        }).returning();

        res.status(201).json(inserted[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/applications/:id
router.put("/applications/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        const { amount_requested, cycle_year } = req.body;

        const existing = await db.select({ id: applicationsTable.id })
            .from(applicationsTable)
            .where(eq(applicationsTable.id, id));

        if (existing.length === 0) return res.status(404).json({ error: "Application not found" });

        const updateData: Record<string, any> = {};
        if (amount_requested !== undefined) updateData.amountRequested = amount_requested.toString();
        if (cycle_year !== undefined) updateData.cycleYear = parseInt(cycle_year, 10);

        const updated = await db.update(applicationsTable)
            .set(updateData)
            .where(eq(applicationsTable.id, id))
            .returning();

        res.json(updated[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/applications/:id
router.delete("/applications/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id as string, 10);

        const result = await db.delete(applicationsTable)
            .where(eq(applicationsTable.id, id))
            .returning({ id: applicationsTable.id });

        if (result.length === 0) return res.status(404).json({ error: "Application not found" });

        res.json({ success: true, message: "Application deleted" });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// CRUD: Disbursements
// ─────────────────────────────────────────────

// POST /api/admin/disbursements
router.post("/disbursements", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { allocation_id, amount, status, fund_source } = req.body;

        let resolvedFundSource = fund_source;
        if (!resolvedFundSource) {
            // Auto-resolve fund source from application
            const [app] = await db.select({ bursaryType: applicationsTable.bursaryType })
                .from(applicationsTable)
                .where(eq(applicationsTable.id, allocation_id));
            if (app) resolvedFundSource = app.bursaryType;
        }

        const inserted = await db.insert(disbursementsTable).values({
            allocationId: allocation_id,
            amount: amount.toString(),
            status: status || "PENDING",
            fundSource: resolvedFundSource || "NATIONAL",
        }).returning();

        res.status(201).json(inserted[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/disbursements/:id
router.put("/disbursements/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        const { amount, status, reference_number, fund_source } = req.body;

        const updateData: Record<string, any> = {};
        if (amount !== undefined) updateData.amount = amount.toString();
        if (status !== undefined) updateData.status = status;
        if (reference_number !== undefined) updateData.referenceNumber = reference_number;
        if (fund_source !== undefined) updateData.fundSource = fund_source;
        if (status === "PROCESSED") updateData.disbursedAt = new Date();

        const updated = await db.update(disbursementsTable)
            .set(updateData)
            .where(eq(disbursementsTable.id, id))
            .returning();

        if (updated.length === 0) return res.status(404).json({ error: "Disbursement not found" });

        // Send email when status transitions to PROCESSED
        if (status === "PROCESSED") {
            const studentRes = await db.select({
                email: usersTable.email,
                fullName: studentsTable.fullName,
                amountAllocated: applicationsTable.amountAllocated,
            })
            .from(disbursementsTable)
            .innerJoin(applicationsTable, eq(disbursementsTable.allocationId, applicationsTable.id))
            .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
            .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
            .where(eq(disbursementsTable.id, id));

            if (studentRes.length > 0) {
                const { email, fullName, amountAllocated } = studentRes[0];
                sendDisbursementCompletedEmail(email, fullName ?? "Student", amountAllocated ?? "0", reference_number ?? null).catch(console.error);
            }
        }

        res.json(updated[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/disbursements/:id
router.delete("/disbursements/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id as string, 10);

        const result = await db.delete(disbursementsTable)
            .where(eq(disbursementsTable.id, id))
            .returning({ id: disbursementsTable.id });

        if (result.length === 0) return res.status(404).json({ error: "Disbursement not found" });

        res.json({ success: true, message: "Disbursement deleted" });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────
// 8. PATCH /api/admin/users/:id/status (SUPER_ADMIN ONLY)
// ─────────────────────────────────────────────
router.patch("/users/:id/status", roleMiddleware("SUPER_ADMIN"), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id as string, 10);
        const { is_active } = req.body;

        if (typeof is_active !== "boolean") {
            return res.status(400).json({ error: "is_active (boolean) is required" });
        }

        const result = await db.update(usersTable)
            .set({ isActive: is_active })
            .where(eq(usersTable.id, id))
            .returning({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive });

        if (result.length === 0) return res.status(404).json({ error: "User not found" });

        // If deactivated, notify the user
        if (is_active === false) {
            // Get user details for notification
            const adminDetails = await db.select({ fullName: adminsTable.fullName })
                .from(adminsTable)
                .where(eq(adminsTable.userId, id))
                .limit(1);
            
            const userName = adminDetails.length > 0 ? adminDetails[0].fullName || 'Administrator' : 'Administrator';
            
            try {
                const { sendAccountDeactivatedEmail } = require('../services/email.service');
                await sendAccountDeactivatedEmail(result[0].email, userName);
            } catch (err) {
                console.error("Failed to send deactivation email:", err);
            }
        }

        res.json(result[0]);
    } catch (err) {
        next(err);
    }
});

export default router;
