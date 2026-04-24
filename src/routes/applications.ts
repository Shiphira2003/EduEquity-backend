import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { usersTable, studentsTable, applicationsTable, fundSourcesTable, needAssessmentTable, notificationsTable, auditLogsTable, rolesTable, disbursementsTable, adminsTable } from "../db/schema";
import { eq, and, desc, asc, count, sql, exists } from "drizzle-orm";
import { upload } from "../middleware/upload";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import {
    sendApplicationSubmittedEmail,
    sendApplicationApprovedEmail,
    sendApplicationRejectedEmail
} from "../services/email.service";
import { updateApplicationScores, getRankedApplications, calculateNeedScore, checkAntiDuplication } from "../services/taada.service";
import { recordCashFlow } from "../services/cashflow.service";

const router = Router();

/* =========================================================
   POST: Student submits application with documents
========================================================= */
router.post(
    "/",
    authMiddleware,
    roleMiddleware("student"),
    upload.fields([
        { name: "school_id", maxCount: 1 },
        { name: "guardian_id", maxCount: 1 },
        { name: "report_card", maxCount: 1 },
        { name: "admission_letter", maxCount: 1 },
        { name: "fee_statement", maxCount: 1 }
    ]),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const {
                cycle_year,
                amount_requested,
                bursary_type,
                county,
                constituency,
                family_income,
                dependents,
                orphaned,
                disabled,
                other_hardships,
                fee_balance
            } = req.body;
            const userId = req.user!.userId;

            if (!cycle_year || !amount_requested) {
                return res.status(400).json({
                    success: false,
                    message: "Missing required fields",
                });
            }

            // Get student ID and status for snapshotting
            const studentResult = await db.select({ 
                id: studentsTable.id,
                institution: studentsTable.institution,
                course: studentsTable.course,
                yearOfStudy: studentsTable.yearOfStudy,
                educationLevel: studentsTable.educationLevel
            }).from(studentsTable).where(eq(studentsTable.userId, userId));

            if (studentResult.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "Student profile not found",
                });
            }

            const student_id = studentResult[0].id;

            // Check if fund source is open and within timeline
            const fundSourceResult = await db.select({
                isOpen: fundSourcesTable.isOpen,
                startDate: fundSourcesTable.startDate,
                endDate: fundSourcesTable.endDate
            })
            .from(fundSourcesTable)
            .where(and(eq(fundSourcesTable.name, bursary_type || 'NATIONAL'), eq(fundSourcesTable.cycleYear, parseInt(cycle_year))));

            if (fundSourceResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: `Fund source for ${bursary_type} (${cycle_year}) does not exist.`,
                });
            }

            const fundSource = fundSourceResult[0];
            if (!fundSource.isOpen) {
                return res.status(400).json({
                    success: false,
                    message: "This bursary is currently closed.",
                });
            }

            // Timeline validation
            const currentDate = new Date();
            if (fundSource.startDate && currentDate < new Date(fundSource.startDate)) {
                return res.status(400).json({
                    success: false,
                    message: "The application period for this bursary has not started yet.",
                });
            }
            if (fundSource.endDate && currentDate > new Date(fundSource.endDate)) {
                return res.status(400).json({
                    success: false,
                    message: "The application period for this bursary has passed.",
                });
            }

            // Anti-duplication check
            const isUnique = await checkAntiDuplication(student_id, parseInt(cycle_year), bursary_type || 'NATIONAL');
            if (!isUnique) {
                return res.status(409).json({
                    success: false,
                    message: `You already have an active application for ${bursary_type || 'NATIONAL'} in the ${cycle_year} cycle.`
                });
            }

            // Handle uploaded files
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };
            const documentUrls: Record<string, string> = {};
            
            if (files) {
                if (files.school_id) documentUrls.school_id = files.school_id[0].path;
                if (files.guardian_id) documentUrls.guardian_id = files.guardian_id[0].path;
                if (files.report_card) documentUrls.report_card = files.report_card[0].path;
                if (files.admission_letter) documentUrls.admission_letter = files.admission_letter[0].path;
                if (files.fee_statement) documentUrls.fee_statement = files.fee_statement[0].path;
            }

            // 1. Insert application
            console.log('📝 Inserting application...');
            const insertResult = await db.insert(applicationsTable).values({
                studentId: student_id,
                cycleYear: parseInt(cycle_year),
                amountRequested: amount_requested.toString(),
                bursaryType: bursary_type || 'NATIONAL',
                county: county || null,
                constituency: constituency || null,
                documentUrl: JSON.stringify(documentUrls),
                feeBalance: fee_balance ? fee_balance.toString() : "0",
                // Snapshotting current student status
                institution: studentResult[0].institution || null,
                course: studentResult[0].course || null,
                yearOfStudy: studentResult[0].yearOfStudy || null,
                educationLevel: studentResult[0].educationLevel || null,
            }).returning();

            console.log('✅ Application inserted, id:', insertResult[0].id);

            const applicationId = insertResult[0].id;

            // 2. Insert need assessment (non-blocking – don't crash if it fails)
            try {
                await db.insert(needAssessmentTable).values({
                    applicationId,
                    familyIncome: family_income ? family_income.toString() : "0",
                    dependents: dependents ? parseInt(dependents, 10) : 0,
                    orphaned: orphaned === 'true' || orphaned === true,
                    disabled: disabled === 'true' || disabled === true,
                    otherHardships: other_hardships || null
                });
                console.log('✅ Need assessment inserted.');
            } catch (assessErr: any) {
                console.warn('⚠️  Need assessment insert failed (non-fatal):', assessErr.message);
            }

            // 3. Set TAADA flag (non-blocking)
            try {
                // Determine flag using sub-queries
                const alreadyFunded = await db.select({ id: applicationsTable.id })
                    .from(applicationsTable)
                    .innerJoin(disbursementsTable, eq(applicationsTable.id, disbursementsTable.allocationId))
                    .where(and(
                        eq(applicationsTable.studentId, student_id),
                        eq(disbursementsTable.status, "APPROVED")
                    ))
                    .limit(1);

                const rejectedBefore = await db.select({ id: applicationsTable.id })
                    .from(applicationsTable)
                    .where(and(
                        eq(applicationsTable.studentId, student_id),
                        eq(applicationsTable.status, "REJECTED")
                    ))
                    .limit(1);

                const taadaFlag = alreadyFunded.length > 0
                    ? "ALREADY_FUNDED"
                    : rejectedBefore.length > 0
                    ? "REJECTED_BEFORE"
                    : "FIRST_TIME";

                await db.update(applicationsTable)
                    .set({ taadaFlag: taadaFlag as any })
                    .where(eq(applicationsTable.id, applicationId));

                console.log('✅ TAADA flag set:', taadaFlag);
            } catch (taadaErr: any) {
                console.warn('⚠️  TAADA flag update failed (non-fatal):', taadaErr.message);
            }

            // 4. Notify admins (non-blocking)
            try {
                const admins = await db.select({ id: usersTable.id })
                    .from(usersTable)
                    .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
                    .where(eq(rolesTable.name, "ADMIN"));

                if (admins.length > 0) {
                    const notifications = admins.map(a => ({
                        userId: a.id,
                        message: `New funding application submitted (ID: ${applicationId})`,
                        type: 'APPLICATION_SUBMITTED'
                    }));
                    await db.insert(notificationsTable).values(notifications);
                }
            } catch (notifErr: any) {
                console.warn('⚠️  Notification insert failed (non-fatal):', notifErr.message);
            }

            // 5. Send student confirmation email (fire-and-forget)
            try {
                const studentEmailResult = await db.select({ email: usersTable.email, full_name: studentsTable.fullName })
                    .from(studentsTable)
                    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
                    .where(eq(studentsTable.id, student_id));
                
                if (studentEmailResult.length > 0) {
                    const { email, full_name } = studentEmailResult[0];
                    sendApplicationSubmittedEmail(email, full_name, parseInt(cycle_year, 10));
                }
            } catch (emailErr: any) {
                console.warn('⚠️  Email query failed (non-fatal):', emailErr.message);
            }

            res.status(201).json({
                success: true,
                message: "Application submitted successfully",
                data: insertResult[0],
            });
        } catch (err: any) {
            console.error('❌ Application submission failed:', err.message, err.detail || '');
            next(err);
        }
    }
);

/* =========================================================
   GET: List My Applications (Student)
========================================================= */
router.get(
    "/my-applications",
    authMiddleware,
    roleMiddleware("student"),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const userId = req.user!.userId;

            // Get student's applications with latest disbursement status via lateral-style sub-select
            const rows = await db.select({
                id: applicationsTable.id,
                cycleYear: applicationsTable.cycleYear,
                amountRequested: applicationsTable.amountRequested,
                amountAllocated: applicationsTable.amountAllocated,
                status: applicationsTable.status,
                taadaFlag: applicationsTable.taadaFlag,
                createdAt: applicationsTable.createdAt,
                rejectionReason: applicationsTable.rejectionReason,
                bursaryType: applicationsTable.bursaryType,
                county: applicationsTable.county,
                constituency: applicationsTable.constituency,
                feeBalance: applicationsTable.feeBalance,
                documentUrl: applicationsTable.documentUrl,
            })
            .from(applicationsTable)
            .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
            .where(eq(studentsTable.userId, userId))
            .orderBy(desc(applicationsTable.createdAt));

            // Attach latest disbursement status for each application
            const enriched = await Promise.all(rows.map(async (row) => {
                const disbursement = await db.select({ status: disbursementsTable.status })
                    .from(disbursementsTable)
                    .where(eq(disbursementsTable.allocationId, row.id))
                    .orderBy(desc(disbursementsTable.createdAt))
                    .limit(1);
                return {
                    ...row,
                    disbursement_status: disbursement[0]?.status ?? null,
                };
            }));

            res.json(enriched);
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: List applications (Admin / Committee)
========================================================= */
router.get(
    "/",
    authMiddleware,
    roleMiddleware("admin", "committee"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { status, page = "1", limit = "10", sortField = "created_at", sortOrder = "desc", bursaryType } = req.query;
            const pageNum = parseInt(page as string, 10) || 1;
            const limitNum = parseInt(limit as string, 10) || 10;
            const offset = (pageNum - 1) * limitNum;

            let baseConditions = [];
            if (status) baseConditions.push(eq(applicationsTable.status, status as any));
            if (bursaryType) baseConditions.push(eq(applicationsTable.bursaryType, bursaryType as any));

            const totalResult = await db.select({ value: count() })
                .from(applicationsTable)
                .where(baseConditions.length > 0 ? and(...baseConditions) : undefined);
            const total = totalResult[0].value;

            let query = db.select({
                id: applicationsTable.id,
                student_id: applicationsTable.studentId,
                full_name: studentsTable.fullName,
                national_id: studentsTable.nationalId,
                institution: studentsTable.institution,
                course: studentsTable.course,
                year_of_study: studentsTable.yearOfStudy,
                cycle_year: applicationsTable.cycleYear,
                amount_requested: applicationsTable.amountRequested,
                amount_allocated: applicationsTable.amountAllocated,
                status: applicationsTable.status,
                taada_flag: applicationsTable.taadaFlag,
                need_score: applicationsTable.needScore,
                document_url: applicationsTable.documentUrl,
                created_at: applicationsTable.createdAt
            })
            .from(applicationsTable)
            .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
            .where(baseConditions.length > 0 ? and(...baseConditions) : undefined);

            // Dynamic Sorting
            let orderBySql: any;
            if (sortField === 'need_score') {
                orderBySql = sortOrder === 'asc' ? asc(applicationsTable.needScore) : desc(applicationsTable.needScore);
            } else if (sortField === 'amount_requested') {
                orderBySql = sortOrder === 'asc' ? asc(applicationsTable.amountRequested) : desc(applicationsTable.amountRequested);
            } else if (sortField === 'taada_flag') {
                orderBySql = sql`CASE applications.taada_flag
                    WHEN 'FIRST_TIME' THEN 1
                    WHEN 'REJECTED_BEFORE' THEN 2
                    WHEN 'ALREADY_FUNDED' THEN 3
                    ELSE 4
                END`;
            } else {
                orderBySql = sortOrder === 'asc' ? asc(applicationsTable.createdAt) : desc(applicationsTable.createdAt);
            }

            const result = await query.orderBy(orderBySql).limit(limitNum).offset(offset);

            const rows = result.map(row => {
                let documents: string[] = [];

                if (row.document_url) {
                    try {
                        documents =
                            typeof row.document_url === "string"
                                ? JSON.parse(row.document_url)
                                : row.document_url;
                    } catch (err) {
                        console.error(
                            `Invalid document_url for application ${row.id}`,
                            row.document_url
                        );
                    }
                }

                return {
                    ...row,
                    document_url: documents,
                };
            });

            res.json({ 
                success: true, 
                data: rows,
                total,
                page: pageNum,
                totalPages: Math.ceil(total / limitNum)
            });
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Audit logs
========================================================= */
router.get(
    "/:id/audit-logs",
    authMiddleware,
    roleMiddleware("admin"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const appId = parseInt(req.params.id as string, 10);

            const appResult = await db.select({ id: applicationsTable.id })
                .from(applicationsTable)
                .where(eq(applicationsTable.id, appId));

            if (appResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Application not found",
                });
            }

            const logs = await db.select({
                id: auditLogsTable.id,
                user_id: auditLogsTable.userId,
                admin_email: usersTable.email,
                system_id: adminsTable.systemId,
                action: auditLogsTable.action,
                old_value: auditLogsTable.oldValue,
                new_value: auditLogsTable.newValue,
                created_at: auditLogsTable.createdAt,
            })
            .from(auditLogsTable)
            .leftJoin(usersTable, eq(auditLogsTable.userId, usersTable.id))
            .leftJoin(adminsTable, eq(auditLogsTable.userId, adminsTable.userId))
            .where(eq(auditLogsTable.applicationId, appId))
            .orderBy(desc(auditLogsTable.createdAt));

            res.json({
                success: true,
                audit_logs: logs,
            });
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   PATCH: Approve / Reject application
========================================================= */
router.patch(
    "/:id/status",
    authMiddleware,
    roleMiddleware("admin"),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const id = req.params.id as string;
            const { status, amount_allocated, rejection_reason } = req.body;
            const admin_id = req.user!.userId;

            if (!["APPROVED", "REJECTED"].includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid status",
                });
            }

            const appResult = await db.select().from(applicationsTable).where(eq(applicationsTable.id, parseInt(id)));

            if (appResult.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Application not found",
                });
            }

            if (status === "APPROVED" && (!amount_allocated || amount_allocated <= 0)) {
                return res.status(400).json({
                    success: false,
                    message: "amount_allocated must be greater than 0",
                });
            }

            const updateResult = await db.update(applicationsTable)
                .set({
                    status: status as any,
                    amountAllocated: (amount_allocated || 0).toString(),
                    rejectionReason: rejection_reason || null
                })
                .where(eq(applicationsTable.id, parseInt(id)))
                .returning();

            // Record ALLOCATION in cash flow if approved
            if (status === "APPROVED") {
                const bursaryType = appResult[0].bursaryType || "NATIONAL";
                try {
                    await recordCashFlow(
                        bursaryType,
                        "ALLOCATION",
                        amount_allocated,
                        `APP-${id}`,
                        `Approval of application #${id}`,
                        undefined
                    );
                } catch (cfErr) {
                    console.error("Failed to record allocation cash flow:", cfErr);
                }
            }

            await db.insert(auditLogsTable).values({
                userId: admin_id,
                applicationId: parseInt(id),
                action: status,
                oldValue: JSON.stringify({
                    status: appResult[0].status,
                    amount_allocated: appResult[0].amountAllocated,
                }),
                newValue: JSON.stringify({
                    status,
                    amount_allocated: amount_allocated,
                }),
            });

            // Send email to student
            const studentEmailRes = await db.select({ email: usersTable.email, full_name: studentsTable.fullName, cycle_year: applicationsTable.cycleYear })
                .from(applicationsTable)
                .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
                .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
                .where(eq(applicationsTable.id, parseInt(id)));

            if (studentEmailRes.length > 0) {
                const { email, full_name, cycle_year } = studentEmailRes[0];
                if (status === "APPROVED") {
                    sendApplicationApprovedEmail(email, full_name, cycle_year, amount_allocated);
                } else {
                    sendApplicationRejectedEmail(email, full_name, cycle_year, rejection_reason || null);
                }
            }

            res.json({
                success: true,
                message: "Application updated successfully",
                data: updateResult[0],
            });
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   POST: Auto-evaluate applications
========================================================= */
router.post(
    "/auto-evaluate",
    authMiddleware,
    roleMiddleware("admin"),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { cycle_year } = req.body;
            const admin_id = req.user!.userId;

            if (!cycle_year) {
                return res.status(400).json({ success: false, message: "cycle_year is required" });
            }

            // 1. Get all pending applications for the cycle
            const pendingQuery = await db.select({ id: applicationsTable.id })
                .from(applicationsTable)
                .where(and(eq(applicationsTable.cycleYear, parseInt(cycle_year)), eq(applicationsTable.status, "PENDING")));

            // 2. Ensure their need scores are up to date
            for (const row of pendingQuery) {
                await updateApplicationScores(row.id);
            }

            // 3. Get ranked applications (with calculated recommendedAllocation)
            const ranked = await getRankedApplications(cycle_year);

            let approvedCount = 0;
            let rejectedCount = 0;
            let pendingCount = 0;

            for (const app of ranked) {
                let newStatus = 'PENDING';
                let allocation = 0;
                let reason = null;

                if (app.needScore >= 70) {
                    newStatus = 'APPROVED';
                    allocation = app.recommendedAllocation;
                } else if (app.needScore <= 40) {
                    newStatus = 'REJECTED';
                    reason = 'Automatically rejected: Did not meet the minimum need threshold.';
                } else {
                    pendingCount++;
                    continue; // Leave as pending
                }

                // Update application
                await db.update(applicationsTable)
                    .set({
                        status: newStatus as any,
                        amountAllocated: allocation.toString(),
                        rejectionReason: reason
                    })
                    .where(eq(applicationsTable.id, app.applicationId));

                // Add audit log
                await db.insert(auditLogsTable).values({
                    userId: admin_id,
                    applicationId: app.applicationId,
                    action: newStatus,
                    oldValue: JSON.stringify({ status: 'PENDING', amount_allocated: 0 }),
                    newValue: JSON.stringify({ status: newStatus, amount_allocated: allocation })
                });

                // Send email
                try {
                    const studentRes = await db.select({ email: usersTable.email, full_name: studentsTable.fullName })
                        .from(applicationsTable)
                        .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
                        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
                        .where(eq(applicationsTable.id, app.applicationId));

                    if (studentRes.length > 0) {
                        const { email, full_name } = studentRes[0];
                        if (newStatus === "APPROVED") {
                            sendApplicationApprovedEmail(email, full_name, cycle_year, allocation);
                            approvedCount++;
                        } else {
                            sendApplicationRejectedEmail(email, full_name, cycle_year, reason);
                            rejectedCount++;
                        }
                    }
                } catch (emailErr) {
                    console.error("Failed to send automated email:", emailErr);
                }
            }

            res.json({
                success: true,
                message: "Auto-evaluation completed",
                data: {
                    totalEvaluated: ranked.length,
                    approved: approvedCount,
                    rejected: rejectedCount,
                    stillPending: pendingCount
                }
            });
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Get Ranked Applications (Equity Ranking)
========================================================= */
router.get(
    "/ranking",
    authMiddleware,
    roleMiddleware("SUPER_ADMIN"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const cycleYear = parseInt(req.query.cycle_year as string) || new Date().getFullYear();
            const bursaryType = req.query.bursary_type as string;

            const ranked = await getRankedApplications(cycleYear, bursaryType);
            res.json(ranked);
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Get Score Breakdown for an application
========================================================= */
router.get(
    "/:id/score-breakdown",
    authMiddleware,
    roleMiddleware("admin"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const id = parseInt(req.params.id as string, 10);
            
            // Get current flag
            const [app] = await db.select({ taadaFlag: applicationsTable.taadaFlag })
                .from(applicationsTable)
                .where(eq(applicationsTable.id, id));
            
            if (!app) return res.status(404).json({ message: "Application not found" });

            const breakdown = await calculateNeedScore(id, app.taadaFlag || "FIRST_TIME");
            res.json(breakdown);
        } catch (err) {
            next(err);
        }
    }
);

export default router;
