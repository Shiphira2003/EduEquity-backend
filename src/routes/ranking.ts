import { Router, Request, Response, NextFunction } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import { successResponse } from "../utils/response";
import { getRankedApplications } from "../services/taada.service";

const router = Router();

/* =========================================================
   GET: Ranked applications for a cycle (TAADA Algorithm)
========================================================= */
router.get(
    "/cycle/:cycleYear/:bursaryType?",
    authMiddleware,
    roleMiddleware("admin", "committee"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { cycleYear, bursaryType } = req.params;

            const rankings = await getRankedApplications(
                parseInt(cycleYear),
                bursaryType || undefined,
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
            const { applicationId } = req.params;
            const userId = req.user!.userId;

            // Get application details
            const appResult = await pool.query(
                `
                SELECT
                    a.id,
                    a.student_id,
                    a.cycle_year,
                    a.bursary_type,
                    a.need_score,
                    a.taada_flag,
                    a.amount_requested
                FROM applications a
                JOIN students s ON a.student_id = s.id
                WHERE a.id = $1 AND s.user_id = $2
                `,
                [applicationId, userId]
            );

            if (appResult.rowCount === 0) {
                return successResponse(res, "Application not found", null);
            }

            const app = appResult.rows[0];

            // Get rankings for this cycle/bursary
            const rankings = await getRankedApplications(
                app.cycle_year,
                app.bursary_type
            );

            // Find student's rank
            const studentRanking = rankings.find(
                (r: any) => r.applicationId === parseInt(applicationId)
            );

            successResponse(res, "Student ranking retrieved", {
                applicationId: parseInt(applicationId),
                studentId: app.student_id,
                cycleYear: app.cycle_year,
                bursaryType: app.bursary_type,
                needScore: parseFloat(app.need_score),
                taadaFlag: app.taada_flag,
                amountRequested: parseFloat(app.amount_requested),
                rank: studentRanking?.rank || null,
                totalApplicants: rankings.length,
                percentile:
                    studentRanking && rankings.length > 0
                        ? Math.round(((studentRanking.rank / rankings.length) * 100))
                        : null,
                recommendedAllocation: studentRanking?.recommendedAllocation || 0,
            });
        } catch (err) {
            next(err);
        }
    }
);

import pool from "../db/db";

export default router;
