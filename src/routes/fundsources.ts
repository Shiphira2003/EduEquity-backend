import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db/db";
import { fundSourcesTable } from "../db/schema";
import { desc, asc, eq, and } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import { validateFundSource } from "../middleware/validation";
import { successResponse, errorResponse } from "../utils/response";
import { HTTP_STATUS } from "../constants";
import {
    getFundSourceBalances,
    recordCashFlow,
    getCashFlowHistory,
    getCashFlowSummary,
    verifyDisbursementBudget,
    generateCashFlowReport,
} from "../services/cashflow.service";

const router = Router();

router.get("/public", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db.select({
            id: fundSourcesTable.id,
            name: fundSourcesTable.name,
            description: fundSourcesTable.description,
            budget_per_cycle: fundSourcesTable.budgetPerCycle,
            cycle_year: fundSourcesTable.cycleYear,
            is_open: fundSourcesTable.isOpen,
            start_date: fundSourcesTable.startDate,
            end_date: fundSourcesTable.endDate
        })
        .from(fundSourcesTable)
        .orderBy(desc(fundSourcesTable.cycleYear), desc(fundSourcesTable.isOpen), asc(fundSourcesTable.name));

        successResponse(res, "Public fund sources retrieved", result);
    } catch (err) {
        next(err);
    }
});

// Preserve the old /open route just in case it's used elsewhere
router.get("/open", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await db.select({
            id: fundSourcesTable.id,
            name: fundSourcesTable.name,
            description: fundSourcesTable.description,
            budget_per_cycle: fundSourcesTable.budgetPerCycle,
            cycle_year: fundSourcesTable.cycleYear,
            is_open: fundSourcesTable.isOpen,
            start_date: fundSourcesTable.startDate,
            end_date: fundSourcesTable.endDate
        })
        .from(fundSourcesTable)
        .where(eq(fundSourcesTable.isOpen, true))
        .orderBy(desc(fundSourcesTable.cycleYear), asc(fundSourcesTable.name));

        successResponse(res, "Open fund sources retrieved", result);
    } catch (err) {
        next(err);
    }
});

// Apply auth and admin role to all routes in this file
router.use(authMiddleware, roleMiddleware("admin"));

/* =========================================================
   GET: Fund source balances for a cycle
========================================================= */
router.get("/balances/:cycleYear", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cycleYear } = req.params;
        const cycleYearNum = parseInt(cycleYear as string, 10);
        const balances = await getFundSourceBalances(cycleYearNum);

        if (balances.length === 0) {
            // Initialize fund sources if they don't exist
            const fundSources = [
                { name: "MCA", budget: 500000, description: "Mobilization on Contentious Areas" },
                { name: "CDF", budget: 300000, description: "Constituency Development Fund" },
                { name: "COUNTY", budget: 400000, description: "County Government Budget" },
                { name: "NATIONAL", budget: 800000, description: "National Government Budget" },
            ];

            for (const source of fundSources) {
                const existing = await db.select({ id: fundSourcesTable.id })
                    .from(fundSourcesTable)
                    .where(and(
                        eq(fundSourcesTable.name, source.name as any), 
                        eq(fundSourcesTable.cycleYear, cycleYearNum)
                    ));
                if (existing.length === 0) {
                    await db.insert(fundSourcesTable).values({
                        name: source.name as any,
                        description: source.description,
                        budgetPerCycle: source.budget.toString(),
                        cycleYear: cycleYearNum,
                        allocatedAmount: "0",
                        disbursedAmount: "0"
                    });
                }
            }

            const newBalances = await getFundSourceBalances(cycleYearNum);
            return successResponse(res, "Fund source balances retrieved", newBalances);
        }

        successResponse(res, "Fund source balances retrieved", balances);
    } catch (err) {
        next(err);
    }
});

/* =========================================================
   GET: Cash flow history for a fund source
========================================================= */
router.get(
    "/cashflow/history/:fundSource/:cycleYear",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { fundSource, cycleYear } = req.params;
            const history = await getCashFlowHistory(fundSource as string, parseInt(cycleYear as string, 10), 500);

            successResponse(res, "Cash flow history retrieved", {
                fundSource,
                cycleYear,
                recordCount: history.length,
                records: history,
            });
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Cash flow summary for a cycle
========================================================= */
router.get("/cashflow/summary/:cycleYear", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cycleYear } = req.params;
        const cycleYearNum = parseInt(cycleYear as string, 10);
        const summary = await getCashFlowSummary(cycleYearNum);
        const balances = await getFundSourceBalances(cycleYearNum);

        successResponse(res, "Cash flow summary retrieved", {
            cycleYear,
            summary,
            balances,
        });
    } catch (err) {
        next(err);
    }
});

/* =========================================================
   GET: Fund source configuration
========================================================= */
router.get("/config/:cycleYear", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cycleYear } = req.params;

        const result = await db.select({
            id: fundSourcesTable.id,
            name: fundSourcesTable.name,
            description: fundSourcesTable.description,
            budget_per_cycle: fundSourcesTable.budgetPerCycle,
            allocated_amount: fundSourcesTable.allocatedAmount,
            disbursed_amount: fundSourcesTable.disbursedAmount,
            is_open: fundSourcesTable.isOpen,
            start_date: fundSourcesTable.startDate,
            end_date: fundSourcesTable.endDate,
            created_at: fundSourcesTable.createdAt,
            updated_at: fundSourcesTable.updatedAt
        })
        .from(fundSourcesTable)
        .where(eq(fundSourcesTable.cycleYear, parseInt(cycleYear as string, 10)))
        .orderBy(asc(fundSourcesTable.name));

        successResponse(res, "Fund source configuration retrieved", result);
    } catch (err) {
        next(err);
    }
});

/* =========================================================
   PUT: Update fund source configuration
========================================================= */
router.put(
    "/config/:fundSourceId",
    validateFundSource,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { fundSourceId } = req.params;
            const { budget_per_cycle, description, is_open, start_date, end_date } = req.body;

            const updateData: any = { updatedAt: new Date() };
            if (budget_per_cycle !== undefined) updateData.budgetPerCycle = budget_per_cycle.toString();
            if (description !== undefined) updateData.description = description;
            if (is_open !== undefined) updateData.isOpen = is_open;
            if (start_date !== undefined) updateData.startDate = new Date(start_date);
            if (end_date !== undefined) updateData.endDate = new Date(end_date);

            const result = await db.update(fundSourcesTable)
                .set(updateData)
                .where(eq(fundSourcesTable.id, parseInt(fundSourceId as string, 10)))
                .returning();

            if (result.length === 0) {
                return errorResponse(res, "Fund source not found", HTTP_STATUS.NOT_FOUND);
            }

            successResponse(res, "Fund source updated", result[0]);
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   GET: Report - Cash flow by fund source
========================================================= */
router.get(
    "/report/:fundSource/:startDate/:endDate",
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { fundSource, startDate, endDate } = req.params;

            const report = await generateCashFlowReport(
                fundSource as string,
                new Date(startDate as string),
                new Date(endDate as string)
            );

            if (!report) {
                return errorResponse(res, "Failed to generate report", HTTP_STATUS.INTERNAL_SERVER_ERROR);
            }

            successResponse(res, "Cash flow report generated", report);
        } catch (err) {
            next(err);
        }
    }
);

/* =========================================================
   POST: Create fund source budget record
========================================================= */
router.post(
    "/",
    validateFundSource,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { name, budget_per_cycle, cycle_year, description } = req.body;

            // Check if already exists
            const existing = await db.select({ id: fundSourcesTable.id })
                .from(fundSourcesTable)
                .where(and(eq(fundSourcesTable.name, name), eq(fundSourcesTable.cycleYear, parseInt(cycle_year))));

            if (existing.length > 0) {
                return errorResponse(
                    res,
                    `Fund source ${name} already exists for cycle ${cycle_year}`,
                    HTTP_STATUS.CONFLICT
                );
            }

            const result = await db.insert(fundSourcesTable).values({
                name,
                description,
                budgetPerCycle: budget_per_cycle.toString(),
                cycleYear: parseInt(cycle_year as string, 10),
                allocatedAmount: "0",
                disbursedAmount: "0"
            }).returning();

            successResponse(res, "Fund source created", result[0], HTTP_STATUS.CREATED);
        } catch (err) {
            next(err);
        }
    }
);

export default router;
