import pool from "../db/db";
import { errorResponse, successResponse } from "../utils/response";
import { Response } from "express";

// ============================================
// FUND SOURCE & CASH FLOW MANAGEMENT
// ============================================

export interface FundSourceBalance {
  fundSource: string;
  budgetPerCycle: number;
  allocatedAmount: number;
  disbursedAmount: number;
  availableBalance: number;
  utilizationPercentage: number;
}

export interface CashFlowRecord {
  id: number;
  fundSource: string;
  transactionType: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId: string;
  notes: string;
  createdAt: string;
}

/**
 * Initialize fund sources for a cycle
 * Creates fund source budget records if they don't exist
 */
export const initializeFundSources = async (cycleYear: number): Promise<void> => {
  try {
    const fundSources = [
      { name: "MCA", budget: 500000, description: "Mobilization on Contentious Areas" },
      { name: "CDF", budget: 300000, description: "Constituency Development Fund" },
      { name: "COUNTY", budget: 400000, description: "County Government Budget" },
      { name: "NATIONAL", budget: 800000, description: "National Government Budget" },
    ];

    for (const source of fundSources) {
      // Check if already exists
      const exists = await pool.query(
        `SELECT id FROM fund_sources WHERE name = $1 AND cycle_year = $2`,
        [source.name, cycleYear]
      );

      if (exists.rowCount === 0) {
        await pool.query(
          `
          INSERT INTO fund_sources (name, description, budget_per_cycle, cycle_year, allocated_amount, disbursed_amount)
          VALUES ($1, $2, $3, $4, 0, 0)
          `,
          [source.name, source.description, source.budget, cycleYear]
        );
      }
    }
  } catch (error) {
    console.error("Error initializing fund sources:", error);
  }
};

/**
 * Get fund source balances for a cycle
 */
export const getFundSourceBalances = async (
  cycleYear: number
): Promise<FundSourceBalance[]> => {
  try {
    const result = await pool.query(
      `
      SELECT
        name as fund_source,
        budget_per_cycle as budget_per_cycle,
        allocated_amount as allocated_amount,
        disbursed_amount as disbursed_amount,
        (budget_per_cycle - allocated_amount) as available_balance,
        ROUND((allocated_amount / budget_per_cycle * 100)::numeric, 2) as utilization_percentage
      FROM fund_sources
      WHERE cycle_year = $1
      ORDER BY name
      `,
      [cycleYear]
    );

    return result.rows.map((row: any) => ({
      fundSource: row.fund_source,
      budgetPerCycle: parseFloat(row.budget_per_cycle),
      allocatedAmount: parseFloat(row.allocated_amount),
      disbursedAmount: parseFloat(row.disbursed_amount),
      availableBalance: parseFloat(row.available_balance),
      utilizationPercentage: parseFloat(row.utilization_percentage),
    }));
  } catch (error) {
    console.error("Error getting fund source balances:", error);
    return [];
  }
};

/**
 * Record cash flow transaction
 * Called when allocation or disbursement happens
 */
export const recordCashFlow = async (
  fundSource: string,
  transactionType: string, // ALLOCATION, DISBURSEMENT, REVERSAL
  amount: number,
  referenceId: string,
  notes?: string,
  disbursementId?: number
): Promise<void> => {
  try {
    // Get current balance before this transaction
    const lastRecord = await pool.query(
      `
      SELECT balance_after FROM cash_flow_records
      WHERE fund_source = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [fundSource]
    );

    const balanceBefore = lastRecord.rowCount > 0 ? parseFloat(lastRecord.rows[0].balance_after) : 0;

    // Calculate balance after
    let balanceAfter = balanceBefore;
    if (transactionType === "ALLOCATION") {
      balanceAfter = balanceBefore - amount; // Allocated amount reduces available balance
    } else if (transactionType === "DISBURSEMENT") {
      balanceAfter = balanceBefore; // Disbursement doesn't change allocated balance
    } else if (transactionType === "REVERSAL") {
      balanceAfter = balanceBefore + amount; // Reversal adds back to balance
    }

    // Record the transaction
    await pool.query(
      `
      INSERT INTO cash_flow_records
        (disbursement_id, fund_source, transaction_type, amount, balance_before, balance_after, reference_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [disbursementId, fundSource, transactionType, amount, balanceBefore, balanceAfter, referenceId, notes]
    );

    // Update fund_sources table
    if (transactionType === "ALLOCATION") {
      await pool.query(
        `
        UPDATE fund_sources
        SET allocated_amount = allocated_amount + $1
        WHERE name = $2 AND cycle_year = EXTRACT(YEAR FROM NOW())
        `,
        [amount, fundSource]
      );
    } else if (transactionType === "DISBURSEMENT") {
      await pool.query(
        `
        UPDATE fund_sources
        SET disbursed_amount = disbursed_amount + $1
        WHERE name = $2 AND cycle_year = EXTRACT(YEAR FROM NOW())
        `,
        [amount, fundSource]
      );
    }
  } catch (error) {
    console.error("Error recording cash flow:", error);
  }
};

/**
 * Get cash flow history for a fund source
 */
export const getCashFlowHistory = async (
  fundSource: string,
  cycleYear: number,
  limit: number = 500
): Promise<CashFlowRecord[]> => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        fund_source,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reference_id,
        notes,
        created_at
      FROM cash_flow_records
      WHERE fund_source = $1
        AND EXTRACT(YEAR FROM created_at) = $2
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [fundSource, cycleYear, limit]
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      fundSource: row.fund_source,
      transactionType: row.transaction_type,
      amount: parseFloat(row.amount),
      balanceBefore: parseFloat(row.balance_before),
      balanceAfter: parseFloat(row.balance_after),
      referenceId: row.reference_id,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  } catch (error) {
    console.error("Error getting cash flow history:", error);
    return [];
  }
};

/**
 * Get cash flow summary by fund source for a cycle
 */
export const getCashFlowSummary = async (cycleYear: number) => {
  try {
    const result = await pool.query(
      `
      SELECT
        fund_source,
        transaction_type,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
      FROM cash_flow_records
      WHERE EXTRACT(YEAR FROM created_at) = $1
      GROUP BY fund_source, transaction_type
      ORDER BY fund_source, transaction_type
      `,
      [cycleYear]
    );

    return result.rows;
  } catch (error) {
    console.error("Error getting cash flow summary:", error);
    return [];
  }
};

/**
 * Verify disbursement against budget
 * Returns true if amount can be disbursed from fund source
 */
export const verifyDisbursementBudget = async (
  fundSource: string,
  amount: number,
  cycleYear: number
): Promise<boolean> => {
  try {
    const result = await pool.query(
      `
      SELECT
        budget_per_cycle,
        allocated_amount
      FROM fund_sources
      WHERE name = $1
        AND cycle_year = $2
      `,
      [fundSource, cycleYear]
    );

    if (result.rowCount === 0) return false;

    const budget = parseFloat(result.rows[0].budget_per_cycle);
    const allocated = parseFloat(result.rows[0].allocated_amount);

    return allocated + amount <= budget;
  } catch (error) {
    console.error("Error verifying disbursement budget:", error);
    return false;
  }
};

/**
 * Generate cash flow report for a fund source and period
 */
export const generateCashFlowReport = async (
  fundSource: string,
  startDate: Date,
  endDate: Date
) => {
  try {
    const allocations = await pool.query(
      `
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM cash_flow_records
      WHERE fund_source = $1
        AND transaction_type = 'ALLOCATION'
        AND created_at BETWEEN $2 AND $3
      `,
      [fundSource, startDate, endDate]
    );

    const disbursements = await pool.query(
      `
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM cash_flow_records
      WHERE fund_source = $1
        AND transaction_type = 'DISBURSEMENT'
        AND created_at BETWEEN $2 AND $3
      `,
      [fundSource, startDate, endDate]
    );

    const reversals = await pool.query(
      `
      SELECT COUNT(*) as count, SUM(amount) as total
      FROM cash_flow_records
      WHERE fund_source = $1
        AND transaction_type = 'REVERSAL'
        AND created_at BETWEEN $2 AND $3
      `,
      [fundSource, startDate, endDate]
    );

    return {
      fundSource,
      period: {
        start: startDate,
        end: endDate,
      },
      allocations: {
        count: parseInt(allocations.rows[0].count || 0),
        total: parseFloat(allocations.rows[0].total || 0),
      },
      disbursements: {
        count: parseInt(disbursements.rows[0].count || 0),
        total: parseFloat(disbursements.rows[0].total || 0),
      },
      reversals: {
        count: parseInt(reversals.rows[0].count || 0),
        total: parseFloat(reversals.rows[0].total || 0),
      },
    };
  } catch (error) {
    console.error("Error generating cash flow report:", error);
    return null;
  }
};

/**
 * Get all applications approved but not yet disbursed for a fund source
 */
export const getPendingDisbursements = async (fundSource: string) => {
  try {
    const result = await pool.query(
      `
      SELECT
        d.id as disbursement_id,
        d.allocation_id,
        a.id as application_id,
        a.student_id,
        s.full_name,
        s.national_id,
        a.amount_allocated,
        d.amount,
        d.status,
        d.created_at
      FROM disbursements d
      JOIN applications a ON d.allocation_id = a.id
      JOIN students s ON a.student_id = s.id
      WHERE d.fund_source = $1
        AND d.status IN ('PENDING', 'APPROVED')
      ORDER BY d.created_at ASC
      `,
      [fundSource]
    );

    return result.rows;
  } catch (error) {
    console.error("Error getting pending disbursements:", error);
    return [];
  }
};

export default {
  initializeFundSources,
  getFundSourceBalances,
  recordCashFlow,
  getCashFlowHistory,
  getCashFlowSummary,
  verifyDisbursementBudget,
  generateCashFlowReport,
  getPendingDisbursements,
};
