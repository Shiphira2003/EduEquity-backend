import { db } from "../db/db";
import {
    fundSourcesTable,
    cashFlowTable,
    disbursementsTable,
    applicationsTable,
    studentsTable,
    notificationsTable,
    usersTable,
    announcementsTable,
} from "../db/schema";
import { eq, and, sql, desc, count, sum, between, inArray } from "drizzle-orm";
import { notifySuperAdmins } from "./notification.service";

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
      { name: "MCA" as const, budget: "500000", description: "Mobilization on Contentious Areas" },
      { name: "CDF" as const, budget: "300000", description: "Constituency Development Fund" },
      { name: "COUNTY" as const, budget: "400000", description: "County Government Budget" },
      { name: "NATIONAL" as const, budget: "800000", description: "National Government Budget" },
    ];

    for (const source of fundSources) {
      // Check if already exists
      const existing = await db.select({ id: fundSourcesTable.id })
        .from(fundSourcesTable)
        .where(and(
          eq(fundSourcesTable.name, source.name),
          eq(fundSourcesTable.cycleYear, cycleYear)
        ));

      if (existing.length === 0) {
        await db.insert(fundSourcesTable).values({
          name: source.name,
          description: source.description,
          budgetPerCycle: source.budget,
          cycleYear,
          allocatedAmount: "0",
          disbursedAmount: "0",
        });
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
    const result = await db.select({
      fundSource: fundSourcesTable.name,
      budgetPerCycle: fundSourcesTable.budgetPerCycle,
      allocatedAmount: fundSourcesTable.allocatedAmount,
      disbursedAmount: fundSourcesTable.disbursedAmount,
    })
    .from(fundSourcesTable)
    .where(eq(fundSourcesTable.cycleYear, cycleYear))
    .orderBy(fundSourcesTable.name);

    return result.map((row) => {
      const budget = parseFloat(row.budgetPerCycle);
      const allocated = parseFloat(row.allocatedAmount ?? "0");
      const disbursed = parseFloat(row.disbursedAmount ?? "0");
      return {
        fundSource: row.fundSource,
        budgetPerCycle: budget,
        allocatedAmount: allocated,
        disbursedAmount: disbursed,
        availableBalance: budget - allocated,
        utilizationPercentage: budget > 0 ? Math.round((allocated / budget) * 10000) / 100 : 0,
      };
    });
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
    const lastRecord = await db.select({ balanceAfter: cashFlowTable.balanceAfter })
      .from(cashFlowTable)
      .where(eq(cashFlowTable.fundSource, fundSource as any))
      .orderBy(desc(cashFlowTable.createdAt))
      .limit(1);

    const balanceBefore = lastRecord.length > 0 ? parseFloat(lastRecord[0].balanceAfter) : 0;

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
    await db.insert(cashFlowTable).values({
      disbursementId: disbursementId ?? null,
      fundSource: fundSource as any,
      transactionType,
      amount: amount.toString(),
      balanceBefore: balanceBefore.toString(),
      balanceAfter: balanceAfter.toString(),
      referenceId,
      notes: notes ?? null,
    });

    // Update fund_sources table
    const currentYear = new Date().getFullYear();
    if (transactionType === "ALLOCATION") {
      await db.update(fundSourcesTable)
        .set({
          allocatedAmount: sql`${fundSourcesTable.allocatedAmount}::numeric + ${amount}`,
        })
        .where(and(
          eq(fundSourcesTable.name, fundSource as any),
          eq(fundSourcesTable.cycleYear, currentYear)
        ));

      // NEW: Check for budget depletion and auto-close
      const [updatedSource] = await db.select({
          name: fundSourcesTable.name,
          budget: fundSourcesTable.budgetPerCycle,
          allocated: fundSourcesTable.allocatedAmount,
          cycleYear: fundSourcesTable.cycleYear,
          isOpen: fundSourcesTable.isOpen,
      })
      .from(fundSourcesTable)
      .where(and(
          eq(fundSourcesTable.name, fundSource as any),
          eq(fundSourcesTable.cycleYear, currentYear)
      ));

      if (updatedSource && updatedSource.isOpen && parseFloat(updatedSource.allocated ?? "0") >= parseFloat(updatedSource.budget ?? "0")) {
          // 1. Close the fund source
          await db.update(fundSourcesTable)
                  .set({ isOpen: false, updatedAt: new Date() })
                  .where(and(
                      eq(fundSourcesTable.name, fundSource as any),
                      eq(fundSourcesTable.cycleYear, currentYear)
                  ));

          // 2. Notify Super Admins
          const adminMessage = `🚨 FUND DEPLETION: The ${updatedSource.name} (${updatedSource.cycleYear}) fund has reached its budget limit and has been automatically closed.`;
          notifySuperAdmins(adminMessage, 'FUND_DEPLETED');

          // 3. Create platform notifications for all Admins
          try {
              const admins = await db.select({ id: usersTable.id })
                  .from(usersTable)
                  .where(eq(usersTable.role, "ADMIN"));
              
              if (admins.length > 0) {
                  const notifs = admins.map(admin => ({
                      userId: admin.id,
                      message: adminMessage,
                      type: 'FUND_DEPLETED'
                  }));
                  await db.insert(notificationsTable).values(notifs);
              }
          } catch (e) {
              console.error("Failed to create depletion notifications for admins:", e);
          }

          // 4. Create an announcement for Students
          try {
              await db.insert(announcementsTable).values({
                  title: `📢 Fund Update: ${updatedSource.name} Bursary (${updatedSource.cycleYear})`,
                  message: `Attention Students: The ${updatedSource.name} bursary fund for the ${updatedSource.cycleYear} cycle has reached its maximum budget allocation and is now closed for further applications. Thank you to everyone who applied.`,
                  targetAudience: "STUDENTS",
              });
              console.log(`✅ Student announcement created for ${updatedSource.name} depletion.`);
          } catch (e) {
              console.error("Failed to create student announcement:", e);
          }
      }
    } else if (transactionType === "DISBURSEMENT") {
      await db.update(fundSourcesTable)
        .set({
          disbursedAmount: sql`${fundSourcesTable.disbursedAmount}::numeric + ${amount}`,
        })
        .where(and(
          eq(fundSourcesTable.name, fundSource as any),
          eq(fundSourcesTable.cycleYear, currentYear)
        ));
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
    const result = await db.select({
      id: cashFlowTable.id,
      fundSource: cashFlowTable.fundSource,
      transactionType: cashFlowTable.transactionType,
      amount: cashFlowTable.amount,
      balanceBefore: cashFlowTable.balanceBefore,
      balanceAfter: cashFlowTable.balanceAfter,
      referenceId: cashFlowTable.referenceId,
      notes: cashFlowTable.notes,
      createdAt: cashFlowTable.createdAt,
    })
    .from(cashFlowTable)
    .where(and(
      eq(cashFlowTable.fundSource, fundSource as any),
      sql`EXTRACT(YEAR FROM ${cashFlowTable.createdAt}) = ${cycleYear}`
    ))
    .orderBy(desc(cashFlowTable.createdAt))
    .limit(limit);

    return result.map((row) => ({
      id: row.id,
      fundSource: row.fundSource,
      transactionType: row.transactionType,
      amount: parseFloat(row.amount),
      balanceBefore: parseFloat(row.balanceBefore),
      balanceAfter: parseFloat(row.balanceAfter),
      referenceId: row.referenceId ?? "",
      notes: row.notes ?? "",
      createdAt: row.createdAt?.toISOString() ?? "",
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
    const result = await db.select({
      fundSource: cashFlowTable.fundSource,
      transactionType: cashFlowTable.transactionType,
      transactionCount: count(),
      totalAmount: sum(cashFlowTable.amount),
    })
    .from(cashFlowTable)
    .where(sql`EXTRACT(YEAR FROM ${cashFlowTable.createdAt}) = ${cycleYear}`)
    .groupBy(cashFlowTable.fundSource, cashFlowTable.transactionType)
    .orderBy(cashFlowTable.fundSource, cashFlowTable.transactionType);

    return result;
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
    const result = await db.select({
      budgetPerCycle: fundSourcesTable.budgetPerCycle,
      allocatedAmount: fundSourcesTable.allocatedAmount,
    })
    .from(fundSourcesTable)
    .where(and(
      eq(fundSourcesTable.name, fundSource as any),
      eq(fundSourcesTable.cycleYear, cycleYear)
    ));

    if (result.length === 0) return false;

    const budget = parseFloat(result[0].budgetPerCycle);
    const allocated = parseFloat(result[0].allocatedAmount ?? "0");

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
    const [allocations] = await db.select({
      count: count(),
      total: sum(cashFlowTable.amount),
    })
    .from(cashFlowTable)
    .where(and(
      eq(cashFlowTable.fundSource, fundSource as any),
      eq(cashFlowTable.transactionType, "ALLOCATION"),
      between(cashFlowTable.createdAt, startDate, endDate)
    ));

    const [disbursements] = await db.select({
      count: count(),
      total: sum(cashFlowTable.amount),
    })
    .from(cashFlowTable)
    .where(and(
      eq(cashFlowTable.fundSource, fundSource as any),
      eq(cashFlowTable.transactionType, "DISBURSEMENT"),
      between(cashFlowTable.createdAt, startDate, endDate)
    ));

    const [reversals] = await db.select({
      count: count(),
      total: sum(cashFlowTable.amount),
    })
    .from(cashFlowTable)
    .where(and(
      eq(cashFlowTable.fundSource, fundSource as any),
      eq(cashFlowTable.transactionType, "REVERSAL"),
      between(cashFlowTable.createdAt, startDate, endDate)
    ));

    return {
      fundSource,
      period: {
        start: startDate,
        end: endDate,
      },
      allocations: {
        count: allocations.count,
        total: parseFloat(allocations.total ?? "0"),
      },
      disbursements: {
        count: disbursements.count,
        total: parseFloat(disbursements.total ?? "0"),
      },
      reversals: {
        count: reversals.count,
        total: parseFloat(reversals.total ?? "0"),
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
    const result = await db.select({
      disbursementId: disbursementsTable.id,
      allocationId: disbursementsTable.allocationId,
      applicationId: applicationsTable.id,
      studentId: applicationsTable.studentId,
      fullName: studentsTable.fullName,
      nationalId: studentsTable.nationalId,
      amountAllocated: applicationsTable.amountAllocated,
      amount: disbursementsTable.amount,
      status: disbursementsTable.status,
      createdAt: disbursementsTable.createdAt,
    })
    .from(disbursementsTable)
    .innerJoin(applicationsTable, eq(disbursementsTable.allocationId, applicationsTable.id))
    .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
    .where(and(
      eq(disbursementsTable.fundSource, fundSource as any),
      inArray(disbursementsTable.status, ["PENDING", "APPROVED"] as any)
    ))
    .orderBy(disbursementsTable.createdAt);

    return result;
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
