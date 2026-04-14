import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { applicationsTable, studentsTable } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import { successResponse } from "../utils/response";
import { getRankedApplications } from "../services/taada.service";

const router = Router();

/* =========================================================
   GET: Ranked applications for a cycle (TAADA Algorithm)
========================================================= */
router.get(
    ["/cycle/:cycleYear", "/cycle/:cycleYear/:bursaryType"],
    authMiddleware,
    roleMiddleware("admin", "committee"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { cycleYear, bursaryType } = req.params;

            const rankings = await getRankedApplications(
                parseInt(cycleYear as string, 10),
                (bursaryType as string) || undefined,
                100
            );

            successResponse(res, "Ranked applications retrieved", {
                cycleYear,
                bursaryType: bursaryType || "ALL",
                totalApplications: rankings.length,
                rankings,
                description: "Applications ranked by need score (TAADA Algorithm). Higher rank = higher priority.",
            });
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Student's rank for a specific application
========================================================= */
router.get(
    "/student/:applicationId",
    authMiddleware,
    roleMiddleware("student"),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const applicationId = parseInt(req.params.applicationId as string, 10);
            const userId = req.user!.userId;

            // Get application details via Drizzle
            const appResult = await db.select({
                id: applicationsTable.id,
                studentId: applicationsTable.studentId,
                cycleYear: applicationsTable.cycleYear,
                bursaryType: applicationsTable.bursaryType,
                needScore: applicationsTable.needScore,
                taadaFlag: applicationsTable.taadaFlag,
                amountRequested: applicationsTable.amountRequested,
            })
            .from(applicationsTable)
            .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
            .where(and(
                eq(applicationsTable.id, applicationId),
                eq(studentsTable.userId, userId)
            ));

            if (appResult.length === 0) {
                return successResponse(res, "Application not found", null);
            }

            const app = appResult[0];

            // Get rankings for this cycle/bursary
            const rankings = await getRankedApplications(
                app.cycleYear,
                app.bursaryType ?? undefined
            );

            const studentRanking = rankings.find(
                (r: any) => r.applicationId === applicationId
            );

            successResponse(res, "Student ranking retrieved", {
                applicationId,
                studentId: app.studentId,
                cycleYear: app.cycleYear,
                bursaryType: app.bursaryType,
                needScore: parseFloat(app.needScore ?? "0"),
                taadaFlag: app.taadaFlag,
                amountRequested: parseFloat(app.amountRequested),
                rank: studentRanking?.rank || null,
                totalApplicants: rankings.length,
                percentile:
                    studentRanking && rankings.length > 0
                        ? Math.round((studentRanking.rank / rankings.length) * 100)
                        : null,
                recommendedAllocation: studentRanking?.recommendedAllocation || 0,
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
