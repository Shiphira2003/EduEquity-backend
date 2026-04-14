import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { disbursementsTable, applicationsTable, studentsTable } from "../db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

/* =========================================================
   GET: Public Ledger
   Shows a transparent record of all processed disbursements
   without revealing student personal details.
========================================================= */
router.get(
    "/ledger",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = await db.select({
                id: disbursementsTable.id,
                amount: disbursementsTable.amount,
                fund_source: disbursementsTable.fundSource,
                disbursed_at: disbursementsTable.disbursedAt,
                status: disbursementsTable.status,
                institution: studentsTable.institution,
                cycle_year: applicationsTable.cycleYear,
            })
            .from(disbursementsTable)
            .innerJoin(applicationsTable, eq(disbursementsTable.allocationId, applicationsTable.id))
            .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
            .where(eq(disbursementsTable.status, "PROCESSED"))
            .orderBy(desc(disbursementsTable.disbursedAt))
            .limit(100);

            res.json({
                success: true,
                data: result,
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
