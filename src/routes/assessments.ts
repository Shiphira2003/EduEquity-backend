import { Router, Request, Response, NextFunction } from "express";
import pool from "../db/db";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import { validateNeedAssessment } from "../middleware/validation";
import { successResponse, errorResponse } from "../utils/response";
import { HTTP_STATUS } from "../constants";
import { updateApplicationScores } from "../services/taada.service";

const router = Router();

/* =========================================================
   POST: Submit need assessment for an application (Student)
========================================================= */
router.post(
    "/:applicationId/assess",
    authMiddleware,
    roleMiddleware("student"),
    validateNeedAssessment,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { applicationId } = req.params;
            const userId = req.user!.userId;
            const {
                family_income,
                dependents,
                orphaned,
                disabled,
                other_hardships,
                academic_score,
            } = req.body;

            // Verify this application belongs to the student
            const appCheck = await pool.query(
                `
                SELECT a.id FROM applications a
                JOIN students s ON a.student_id = s.id
                WHERE a.id = $1 AND s.user_id = $2
                `,
                [applicationId, userId]
            );

            if (appCheck.rowCount === 0) {
                return errorResponse(res, "Application not found", HTTP_STATUS.NOT_FOUND);
            }

            // Check if assessment already exists
            const existing = await pool.query(
                `SELECT id FROM need_assessment WHERE application_id = $1`,
                [applicationId]
            );

            if (existing.rowCount > 0) {
                // Update existing assessment
                await pool.query(
                    `
                    UPDATE need_assessment
                    SET family_income = $1,
                        dependents = $2,
                        orphaned = $3,
                        disabled = $4,
                        other_hardships = $5,
                        academic_score = $6,
                        updated_at = NOW()
                    WHERE application_id = $7
                    RETURNING *
                    `,
                    [
                        family_income,
                        dependents,
                        orphaned,
                        disabled,
                        other_hardships,
                        academic_score,
                        applicationId,
                    ]
                );
            } else {
                // Insert new assessment
                await pool.query(
                    `
                    INSERT INTO need_assessment
                        (application_id, family_income, dependents, orphaned, disabled, other_hardships, academic_score)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `,
                    [
                        applicationId,
                        family_income,
                        dependents,
                        orphaned,
                        disabled,
                        other_hardships,
                        academic_score,
                    ]
                );
            }

            // Recalculate TAADA scores
            const scoreUpdate = await updateApplicationScores(parseInt(applicationId));

            successResponse(
                res,
                "Need assessment submitted successfully",
                {
                    applicationId,
                    needScore: scoreUpdate.needScore,
                    taadaFlag: scoreUpdate.taadaFlag,
                },
                HTTP_STATUS.CREATED
            );
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Get need assessment for application (Student/Admin)
========================================================= */
router.get(
    "/:applicationId",
    authMiddleware,
    async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const { applicationId } = req.params;

            const result = await pool.query(
                `
                SELECT
                    na.id,
                    na.application_id,
                    na.family_income,
                    na.dependents,
                    na.orphaned,
                    na.disabled,
                    na.other_hardships,
                    na.academic_score,
                    na.need_score_percentage,
                    a.need_score,
                    a.taada_flag
                FROM need_assessment na
                LEFT JOIN applications a ON na.application_id = a.id
                WHERE na.application_id = $1
                `,
                [applicationId]
            );

            if (result.rowCount === 0) {
                return errorResponse(res, "Need assessment not found", HTTP_STATUS.NOT_FOUND);
            }

            successResponse(res, "Need assessment retrieved", result.rows[0]);
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Get all assessments for a cycle (Admin)
========================================================= */
router.get(
    "/cycle/:cycleYear",
    authMiddleware,
    roleMiddleware("admin"),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { cycleYear } = req.params;

            const result = await pool.query(
                `
                SELECT
                    na.id,
                    na.application_id,
                    s.full_name,
                    na.family_income,
                    na.dependents,
                    na.orphaned,
                    na.disabled,
                    na.academic_score,
                    a.need_score,
                    a.taada_flag,
                    a.status
                FROM need_assessment na
                JOIN applications a ON na.application_id = a.id
                JOIN students s ON a.student_id = s.id
                WHERE a.cycle_year = $1
                ORDER BY a.need_score DESC, a.created_at ASC
                `,
                [cycleYear]
            );

            successResponse(res, "Assessments retrieved", {
                count: result.rowCount,
                assessments: result.rows,
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
