import { db } from "../db/db";
import {
    applicationsTable,
    studentsTable,
    usersTable,
    needAssessmentTable,
    disbursementsTable,
} from "../db/schema";
import { eq, and, count, desc, asc, sql, lt, inArray } from "drizzle-orm";

// ============================================
// TAADA ALGORITHM - Tier-based Allocation
// ============================================

/**
 * TAADA - Tiered Allocation & Anti-Duplication Algorithm
 *
 * Objectives:
 * 1. Prioritize first-time applicants (equity)
 * 2. Prevent duplicate funding in same cycle
 * 3. Score students based on NEED (socioeconomic factors)
 * 4. Rank applications across all applicants
 * 5. Ensure fair distribution across bursary sources
 */

export interface TAadaFlagResult {
  flag: "FIRST_TIME" | "ALREADY_FUNDED" | "REJECTED_BEFORE";
  reason: string;
}

export interface NeedScoreCalculation {
  baseScore: number; // Initial score from need assessment
  taadaBonusScore: number; // Bonus for FIRST_TIME (30 points)
  finalScore: number; // Total score (0-100)
  factors: {
    familyIncomeFactor: number;
    dependentsFactor: number;
    orphanedBonus: number;
    disabledBonus: number;
  };
}

export interface ApplicationRanking {
  applicationId: number;
  studentId: number;
  studentName: string | null;
  needScore: number;
  taadaFlag: string;
  rank: number;
  recommendedAllocation: number;
  bursaryType: string;
}

/**
 * Calculate TAADA flag for an application
 * Determines tier: FIRST_TIME > REJECTED_BEFORE > ALREADY_FUNDED
 */
export const calculateTaadaFlag = async (
  studentId: number,
  cycleYear: number,
  bursaryType: string
): Promise<TAadaFlagResult> => {
  try {
    // Check 1: Has this student been funded in THIS CYCLE for THIS BURSARY?
    const [duplicateCheck] = await db.select({ value: count() })
      .from(applicationsTable)
      .where(and(
        eq(applicationsTable.studentId, studentId),
        eq(applicationsTable.cycleYear, cycleYear),
        eq(applicationsTable.bursaryType, bursaryType as any),
        inArray(applicationsTable.status, ["APPROVED", "PENDING"] as any)
      ));

    if (duplicateCheck.value > 0) {
      return {
        flag: "ALREADY_FUNDED",
        reason: `Already has ${bursaryType} application in cycle ${cycleYear}`,
      };
    }

    // Check 2: Has this student been approved+disbursed PREVIOUSLY?
    const previousFunding = await db.select({ value: count() })
      .from(applicationsTable)
      .innerJoin(disbursementsTable, eq(applicationsTable.id, disbursementsTable.allocationId))
      .where(and(
        eq(applicationsTable.studentId, studentId),
        eq(disbursementsTable.status, "PROCESSED"),
        lt(applicationsTable.cycleYear, cycleYear)
      ));

    if (previousFunding[0].value > 0) {
      return {
        flag: "ALREADY_FUNDED",
        reason: "Student has previously received processed disbursement",
      };
    }

    // Check 3: Has student been REJECTED before?
    const [previousRejection] = await db.select({ value: count() })
      .from(applicationsTable)
      .where(and(
        eq(applicationsTable.studentId, studentId),
        eq(applicationsTable.status, "REJECTED")
      ));

    if (previousRejection.value > 0) {
      return {
        flag: "REJECTED_BEFORE",
        reason: "Student was rejected in previous application",
      };
    }

    return {
      flag: "FIRST_TIME",
      reason: "First-time applicant",
    };
  } catch (error) {
    console.error("Error calculating TAADA flag:", error);
    return {
      flag: "FIRST_TIME",
      reason: "Error in calculation, defaulting to FIRST_TIME",
    };
  }
};

/**
 * Calculate Need Score based on socioeconomic factors
 * Scoring breakdown:
 * - Family Income (50%): Lower income = higher score
 * - Dependents (25%): More dependents = higher score
 * - Special Status (25%): Orphaned/Disabled = bonus points
 * - TAADA Tier (10-30 points): FIRST_TIME gets bonus points
 */
export const calculateNeedScore = async (
  applicationId: number,
  taadaFlag: string
): Promise<NeedScoreCalculation> => {
  try {
    const assessment = await db.select({
      familyIncome: needAssessmentTable.familyIncome,
      dependents: needAssessmentTable.dependents,
      orphaned: needAssessmentTable.orphaned,
      disabled: needAssessmentTable.disabled,
    })
    .from(needAssessmentTable)
    .where(eq(needAssessmentTable.applicationId, applicationId));

    if (assessment.length === 0) {
      // No need assessment - default to 50
      return {
        baseScore: 50,
        taadaBonusScore: taadaFlag === "FIRST_TIME" ? 30 : 0,
        finalScore: taadaFlag === "FIRST_TIME" ? 80 : 50,
        factors: {
          familyIncomeFactor: 0,
          dependentsFactor: 0,
          orphanedBonus: 0,
          disabledBonus: 0,
        },
      };
    }

    const data = assessment[0];

    // Calculate factors (all out of 100 initially, then weighted)

    // 1. Family Income Factor (40% weight)
    // Lower income = higher need = higher score
    // Scale: <50k = 100, 50-100k = 80, 100-200k = 60, 200k+ = 40
    let familyIncomeFactor = 40;
    if (data.familyIncome) {
      const income = parseFloat(data.familyIncome);
      if (income < 50000) familyIncomeFactor = 100;
      else if (income < 100000) familyIncomeFactor = 80;
      else if (income < 200000) familyIncomeFactor = 60;
      else if (income < 500000) familyIncomeFactor = 40;
      else familyIncomeFactor = 20;
    }

    // 2. Dependents Factor (20% weight)
    // More dependents = higher need = higher score
    // Scale: 0 = 20, 1-2 = 40, 3-4 = 70, 5+ = 100
    let dependentsFactor = 20;
    if (data.dependents !== undefined && data.dependents !== null) {
      if (data.dependents === 0) dependentsFactor = 20;
      else if (data.dependents <= 2) dependentsFactor = 40;
      else if (data.dependents <= 4) dependentsFactor = 70;
      else dependentsFactor = 100;
    }

    // 3. Special Status Bonuses (15% weight)
    let specialStatusScore = 0;
    let orphanedBonus = 0;
    let disabledBonus = 0;

    if (data.orphaned) orphanedBonus = 25; // 25-point bonus
    if (data.disabled) disabledBonus = 25; // 25-point bonus

    specialStatusScore = Math.min(orphanedBonus + disabledBonus, 100);


    // Calculate weighted base score (0-100)
    const baseScore =
      familyIncomeFactor * 0.5 +
      dependentsFactor * 0.25 +
      specialStatusScore * 0.25;

    // Add TAADA tier bonus
    const taadaBonusScore = taadaFlag === "FIRST_TIME" ? 30 : taadaFlag === "REJECTED_BEFORE" ? 10 : 0;

    // Final score capped at 100
    const finalScore = Math.min(Math.round(baseScore + taadaBonusScore), 100);

    return {
      baseScore: Math.round(baseScore),
      taadaBonusScore,
      finalScore,
      factors: {
        familyIncomeFactor: Math.round(familyIncomeFactor),
        dependentsFactor: Math.round(dependentsFactor),
        orphanedBonus,
        disabledBonus,
      },
    };
  } catch (error) {
    console.error("Error calculating need score:", error);
    return {
      baseScore: 50,
      taadaBonusScore: 0,
      finalScore: 50,
      factors: {
        familyIncomeFactor: 0,
        dependentsFactor: 0,
        orphanedBonus: 0,
        disabledBonus: 0,
      },
    };
  }
};

/**
 * Get ranked applications for a cycle
 * Higher need_score = higher rank (1st = highest priority)
 */
export const getRankedApplications = async (
  cycleYear: number,
  bursaryType?: string,
  limit: number = 100
): Promise<ApplicationRanking[]> => {
  try {
    // Build query dynamically
    let query = db.select({
      applicationId: applicationsTable.id,
      studentId: applicationsTable.studentId,
      fullName: usersTable.fullName,
      needScore: applicationsTable.needScore,
      taadaFlag: applicationsTable.taadaFlag,
      amountRequested: applicationsTable.amountRequested,
      bursaryType: applicationsTable.bursaryType,
    })
    .from(applicationsTable)
    .innerJoin(studentsTable, eq(applicationsTable.studentId, studentsTable.id))
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .$dynamic();

    if (bursaryType) {
      query = query.where(and(
        eq(applicationsTable.cycleYear, cycleYear),
        eq(applicationsTable.status, "PENDING"),
        eq(applicationsTable.bursaryType, bursaryType as any)
      ));
    } else {
      query = query.where(and(
        eq(applicationsTable.cycleYear, cycleYear),
        eq(applicationsTable.status, "PENDING")
      ));
    }

    const result = await query
      .orderBy(desc(applicationsTable.needScore), asc(applicationsTable.createdAt))
      .limit(limit);

    // Calculate recommended allocations based on ranking
    const rankings: ApplicationRanking[] = result.map((row, index) => ({
      applicationId: row.applicationId,
      studentId: row.studentId,
      studentName: row.fullName,
      needScore: parseFloat(row.needScore ?? "0"),
      taadaFlag: row.taadaFlag ?? "FIRST_TIME",
      rank: index + 1,
      recommendedAllocation: calculateRecommendedAllocation(
        index + 1,
        parseFloat(row.amountRequested),
        parseFloat(row.needScore ?? "0")
      ),
      bursaryType: row.bursaryType ?? "NATIONAL",
    }));

    return rankings;
  } catch (error) {
    console.error("Error getting ranked applications:", error);
    return [];
  }
};

/**
 * Calculate recommended allocation based on ranking and need
 * Top-ranked (high need) students get priority allocation
 */
const calculateRecommendedAllocation = (
  rank: number,
  requested: number,
  needScore: number
): number => {
  // Allocate based on need score percentage
  // Top 10% (rank 1-10): 100% of request
  // Next 20% (rank 11-30): 80% of request
  // Next 30% (rank 31-60): 60% of request
  // Rest: 40% of request

  let allocationPercentage = 0.4;

  if (rank <= 10) allocationPercentage = 1.0;
  else if (rank <= 30) allocationPercentage = 0.8;
  else if (rank <= 60) allocationPercentage = 0.6;

  // Also factor in need score for fine-tuning
  const needFactor = needScore / 100; // 0-1
  const finalPercentage = allocationPercentage * (0.8 + 0.2 * needFactor);

  return Math.round(requested * finalPercentage * 100) / 100;
};

/**
 * Check for anti-duplication - prevent student from applying twice in same cycle for same bursary
 */
export const checkAntiDuplication = async (
  studentId: number,
  cycleYear: number,
  bursaryType: string
): Promise<boolean> => {
  try {
    const [result] = await db.select({ value: count() })
      .from(applicationsTable)
      .where(and(
        eq(applicationsTable.studentId, studentId),
        eq(applicationsTable.cycleYear, cycleYear),
        eq(applicationsTable.bursaryType, bursaryType as any),
        inArray(applicationsTable.status, ["PENDING", "APPROVED"] as any)
      ));

    return result.value === 0; // True if no duplicates exist
  } catch (error) {
    console.error("Error checking anti-duplication:", error);
    return false;
  }
};

/**
 * Update application with TAADA flag and need score
 * Called when application is submitted or need assessment is updated
 */
export const updateApplicationScores = async (
  applicationId: number
): Promise<{ taadaFlag: string; needScore: number }> => {
  try {
    // Get application details
    const appResult = await db.select({
      studentId: applicationsTable.studentId,
      cycleYear: applicationsTable.cycleYear,
      bursaryType: applicationsTable.bursaryType,
    })
    .from(applicationsTable)
    .where(eq(applicationsTable.id, applicationId));

    if (appResult.length === 0) {
      throw new Error("Application not found");
    }

    const app = appResult[0];

    // Calculate TAADA flag
    const taadaResult = await calculateTaadaFlag(
      app.studentId,
      app.cycleYear,
      app.bursaryType ?? "NATIONAL"
    );

    // Calculate need score
    const scoreResult = await calculateNeedScore(applicationId, taadaResult.flag);

    // Update application
    await db.update(applicationsTable)
      .set({
        taadaFlag: taadaResult.flag as any,
        needScore: scoreResult.finalScore.toString(),
        updatedAt: new Date(),
      })
      .where(eq(applicationsTable.id, applicationId));

    return {
      taadaFlag: taadaResult.flag,
      needScore: scoreResult.finalScore,
    };
  } catch (error) {
    console.error("Error updating application scores:", error);
    throw error;
  }
};

export default {
  calculateTaadaFlag,
  calculateNeedScore,
  getRankedApplications,
  checkAntiDuplication,
  updateApplicationScores,
};
