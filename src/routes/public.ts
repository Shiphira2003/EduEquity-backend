import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { disbursementsTable, applicationsTable, studentsTable } from "../db/schema";
import { eq, desc, inArray } from "drizzle-orm";

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
            console.log('🔍 Fetching public ledger records...');
            const result = await db.select({
                id: disbursementsTable.id,
                amount: disbursementsTable.amount,
                fund_source: disbursementsTable.fundSource,
                disbursed_at: disbursementsTable.disbursedAt,
                status: disbursementsTable.status,
                institution: applicationsTable.institution,
                cycle_year: applicationsTable.cycleYear,
            })
            .from(disbursementsTable)
            .leftJoin(applicationsTable, eq(disbursementsTable.allocationId, applicationsTable.id))
            .where(inArray(disbursementsTable.status, ["PROCESSED", "PAID"]))
            .orderBy(desc(disbursementsTable.disbursedAt));

            console.log(`✅ Found ${result.length} processed disbursements for public ledger`);
            
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
