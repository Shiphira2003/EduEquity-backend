import { Router, Request, Response, NextFunction } from "express";
import pool from "../db/db";
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

// Apply auth and admin role to all routes in this file
router.use(authMiddleware, roleMiddleware("admin"));

/* =========================================================
   GET: Fund source balances for a cycle
========================================================= */
router.get("/balances/:cycleYear", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cycleYear } = req.params;

        const balances = await getFundSourceBalances(parseInt(cycleYear));

        if (balances.length === 0) {
            // Initialize fund sources if they don't exist
            const fundSources = [
                { name: "MCA", budget: 500000, description: "Mobilization on Contentious Areas" },
                { name: "CDF", budget: 300000, description: "Constituency Development Fund" },
                { name: "COUNTY", budget: 400000, description: "County Government Budget" },
                { name: "NATIONAL", budget: 800000, description: "National Government Budget" },
            ];

            for (const source of fundSources) {
                await pool.query(
                    `
                    INSERT INTO fund_sources (name, description, budget_per_cycle, cycle_year, allocated_amount, disbursed_amount)
                    VALUES ($1, $2, $3, $4, 0, 0)
                    ON CONFLICT DO NOTHING
                    `,
                    [source.name, source.description, source.budget, cycleYear]
                );
            }

            const newBalances = await getFundSourceBalances(parseInt(cycleYear));
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

            const history = await getCashFlowHistory(fundSource, parseInt(cycleYear), 500);

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

        const summary = await getCashFlowSummary(parseInt(cycleYear));
        const balances = await getFundSourceBalances(parseInt(cycleYear));

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

        const result = await pool.query(
            `
            SELECT
                id,
                name,
                description,
                budget_per_cycle,
                allocated_amount,
                disbursed_amount,
                created_at,
                updated_at
            FROM fund_sources
            WHERE cycle_year = $1
            ORDER BY name
            `,
            [cycleYear]
        );

        successResponse(res, "Fund source configuration retrieved", result.rows);
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
            const { budget_per_cycle, description } = req.body;

            const result = await pool.query(
                `
                UPDATE fund_sources
                SET budget_per_cycle = COALESCE($1, budget_per_cycle),
                    description = COALESCE($2, description),
                    updated_at = NOW()
                WHERE id = $3
                RETURNING *
                `,
                [budget_per_cycle, description, fundSourceId]
            );

            if (result.rowCount === 0) {
                return errorResponse(res, "Fund source not found", HTTP_STATUS.NOT_FOUND);
            }

            successResponse(res, "Fund source updated", result.rows[0]);
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
                fundSource,
                new Date(startDate),
                new Date(endDate)
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
            const existing = await pool.query(
                `SELECT id FROM fund_sources WHERE name = $1 AND cycle_year = $2`,
                [name, cycle_year]
            );

            if (existing.rowCount > 0) {
                return errorResponse(
                    res,
                    `Fund source ${name} already exists for cycle ${cycle_year}`,
                    HTTP_STATUS.CONFLICT
                );
            }

            const result = await pool.query(
                `
                INSERT INTO fund_sources (name, description, budget_per_cycle, cycle_year, allocated_amount, disbursed_amount)
                VALUES ($1, $2, $3, $4, 0, 0)
                RETURNING *
                `,
                [name, description, budget_per_cycle, cycle_year]
            );

            successResponse(res, "Fund source created", result.rows[0], HTTP_STATUS.CREATED);
        } catch (err) {
            next(err);
        }
    }
);

export default router;
