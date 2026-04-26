import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import {
    applicationsTable,
    studentsTable,
    needAssessmentTable,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
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
            const applicationId = parseInt(req.params.applicationId as string, 10);
            const userId = req.user!.userId;
            const {
                family_income,
                dependents,
                orphaned,
                disabled,
                other_hardships,
            } = req.body;

            // Verify this application belongs to the student
            const appCheck = await db.select({ id: applicationsTable.id })
                .from(applicationsTable)
                .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
                .where(and(
                    eq(applicationsTable.id, applicationId),
                    eq(studentsTable.userId, userId)
                ));

            if (appCheck.length === 0) {
                return errorResponse(res, "Application not found", HTTP_STATUS.NOT_FOUND);
            }

            // Check if assessment already exists
            const existing = await db.select({ id: needAssessmentTable.id })
                .from(needAssessmentTable)
                .where(eq(needAssessmentTable.applicationId, applicationId));

            if (existing.length > 0) {
                // Update existing assessment
                await db.update(needAssessmentTable)
                    .set({
                        familyIncome: family_income?.toString() ?? null,
                        dependents: dependents ? parseInt(dependents, 10) : 0,
                        orphaned: orphaned === true || orphaned === "true",
                        disabled: disabled === true || disabled === "true",
                        otherHardships: other_hardships ?? null,
                        updatedAt: new Date(),
                    })
                    .where(eq(needAssessmentTable.applicationId, applicationId));
            } else {
                // Insert new assessment
                await db.insert(needAssessmentTable).values({
                    applicationId,
                    familyIncome: family_income?.toString() ?? null,
                    dependents: dependents ? parseInt(dependents, 10) : 0,
                    orphaned: orphaned === true || orphaned === "true",
                    disabled: disabled === true || disabled === "true",
                    otherHardships: other_hardships ?? null,
                });
            }

            // Recalculate TAADA scores
            const scoreUpdate = await updateApplicationScores(applicationId);

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
            const applicationId = parseInt(req.params.applicationId as string, 10);

            const result = await db.select({
                id: needAssessmentTable.id,
                applicationId: needAssessmentTable.applicationId,
                familyIncome: needAssessmentTable.familyIncome,
                dependents: needAssessmentTable.dependents,
                orphaned: needAssessmentTable.orphaned,
                disabled: needAssessmentTable.disabled,
                otherHardships: needAssessmentTable.otherHardships,
                needScorePercentage: needAssessmentTable.scorePercentage,
                needScore: applicationsTable.needScore,
                taadaFlag: applicationsTable.taadaFlag,
            })
            .from(needAssessmentTable)
            .leftJoin(applicationsTable, eq(needAssessmentTable.applicationId, applicationsTable.id))
            .where(eq(needAssessmentTable.applicationId, applicationId));

            if (result.length === 0) {
                return errorResponse(res, "Need assessment not found", HTTP_STATUS.NOT_FOUND);
            }

            successResponse(res, "Need assessment retrieved", result[0]);
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
            const cycleYear = parseInt(req.params.cycleYear as string, 10);

            const result = await db.select({
                id: needAssessmentTable.id,
                applicationId: needAssessmentTable.applicationId,
                fullName: studentsTable.fullName,
                familyIncome: needAssessmentTable.familyIncome,
                dependents: needAssessmentTable.dependents,
                orphaned: needAssessmentTable.orphaned,
                disabled: needAssessmentTable.disabled,
                needScore: applicationsTable.needScore,
                taadaFlag: applicationsTable.taadaFlag,
                status: applicationsTable.status,
            })
            .from(needAssessmentTable)
            .innerJoin(applicationsTable, eq(needAssessmentTable.applicationId, applicationsTable.id))
            .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
            .where(eq(applicationsTable.cycleYear, cycleYear))
            .orderBy(applicationsTable.needScore);

            successResponse(res, "Assessments retrieved", {
                count: result.length,
                assessments: result,
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
