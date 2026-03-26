import pool from "../db/db";

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
    academicFactor: number;
  };
}

export interface ApplicationRanking {
  applicationId: number;
  studentId: number;
  studentName: string;
  needScore: number;
  taadaFlag: string;
  rank: number;
  recommendedAllocation: number; // Suggested amount based on ranking
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
    const duplicateCheck = await pool.query(
      `
      SELECT COUNT(*) as count FROM applications
      WHERE student_id = $1
        AND cycle_year = $2
        AND bursary_type = $3
        AND status IN ('APPROVED', 'PENDING')
      LIMIT 1
      `,
      [studentId, cycleYear, bursaryType]
    );

    if (parseInt(duplicateCheck.rows[0].count) > 0) {
      return {
        flag: "ALREADY_FUNDED",
        reason: `Already has ${bursaryType} application in cycle ${cycleYear}`,
      };
    }

    // Check 2: Has this student been approved+disbursed PREVIOUSLY?
    const previousFunding = await pool.query(
      `
      SELECT COUNT(*) as count FROM applications a
      JOIN disbursements d ON a.id = d.allocation_id
      WHERE a.student_id = $1
        AND d.status = 'PROCESSED'
        AND a.cycle_year < $2
      LIMIT 1
      `,
      [studentId, cycleYear]
    );

    if (parseInt(previousFunding.rows[0].count) > 0) {
      return {
        flag: "ALREADY_FUNDED",
        reason: "Student has previously received processed disbursement",
      };
    }

    // Check 3: Has student been REJECTED before?
    const previousRejection = await pool.query(
      `
      SELECT COUNT(*) as count FROM applications
      WHERE student_id = $1
        AND status = 'REJECTED'
      LIMIT 1
      `,
      [studentId]
    );

    if (parseInt(previousRejection.rows[0].count) > 0) {
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
 * - Family Income (40%): Lower income = higher score
 * - Dependents (20%): More dependents = higher score
 * - Special Status (15%): Orphaned/Disabled = bonus points
 * - Academic Performance (15%): Better grades = slight bonus
 * - TAADA Tier (10%): FIRST_TIME gets 30-point bonus
 */
export const calculateNeedScore = async (
  applicationId: number,
  taadaFlag: string
): Promise<NeedScoreCalculation> => {
  try {
    // Get need assessment data
    const assessment = await pool.query(
      `
      SELECT
        family_income,
        dependents,
        orphaned,
        disabled,
        academic_score
      FROM need_assessment
      WHERE application_id = $1
      `,
      [applicationId]
    );

    if (assessment.rowCount === 0) {
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
          academicFactor: 0,
        },
      };
    }

    const data = assessment.rows[0];

    // Calculate factors (all out of 100 initially, then weighted)

    // 1. Family Income Factor (40% weight)
    // Lower income = higher need = higher score
    // Scale: <50k = 100, 50-100k = 80, 100-200k = 60, 200k+ = 40
    let familyIncomeFactor = 40;
    if (data.family_income) {
      const income = parseFloat(data.family_income);
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
    if (data.dependents !== undefined) {
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

    // 4. Academic Performance (15% weight - inverse)
    // Higher grades = slight bonus (helps tie-breaking)
    let academicFactor = 50; // Neutral
    if (data.academic_score) {
      const score = parseFloat(data.academic_score);
      // Scale: 0-40 = 30, 40-60 = 50, 60-80 = 70, 80-100 = 90
      if (score < 40) academicFactor = 30;
      else if (score < 60) academicFactor = 50;
      else if (score < 80) academicFactor = 70;
      else academicFactor = 90;
    }

    // Calculate weighted base score (0-100)
    const baseScore =
      familyIncomeFactor * 0.4 +
      dependentsFactor * 0.2 +
      specialStatusScore * 0.15 +
      academicFactor * 0.15;

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
        academicFactor: Math.round(academicFactor),
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
        academicFactor: 0,
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
    let query = `
      SELECT
        a.id as application_id,
        a.student_id,
        s.full_name,
        a.need_score,
        a.taada_flag,
        a.amount_requested,
        ROW_NUMBER() OVER (ORDER BY a.need_score DESC, a.created_at ASC) as rank
      FROM applications a
      JOIN students s ON a.student_id = s.id
      WHERE a.cycle_year = $1
        AND a.status = 'PENDING'
    `;

    const params: any[] = [cycleYear];

    if (bursaryType) {
      query += ` AND a.bursary_type = $${params.length + 1}`;
      params.push(bursaryType);
    }

    query += ` ORDER BY a.need_score DESC, a.created_at ASC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    // Calculate recommended allocations based on ranking
    const rankings: ApplicationRanking[] = result.rows.map((row: any) => ({
      applicationId: row.application_id,
      studentId: row.student_id,
      studentName: row.full_name,
      needScore: parseFloat(row.need_score),
      taadaFlag: row.taada_flag,
      rank: row.rank,
      recommendedAllocation: calculateRecommendedAllocation(
        row.rank,
        parseFloat(row.amount_requested),
        parseFloat(row.need_score)
      ),
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
    const result = await pool.query(
      `
      SELECT COUNT(*) as count FROM applications
      WHERE student_id = $1
        AND cycle_year = $2
        AND bursary_type = $3
        AND status IN ('PENDING', 'APPROVED')
      `,
      [studentId, cycleYear, bursaryType]
    );

    return parseInt(result.rows[0].count) === 0; // True if no duplicates exist
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
    const appResult = await pool.query(
      `
      SELECT student_id, cycle_year, bursary_type
      FROM applications
      WHERE id = $1
      `,
      [applicationId]
    );

    if (appResult.rowCount === 0) {
      throw new Error("Application not found");
    }

    const app = appResult.rows[0];

    // Calculate TAADA flag
    const taadaResult = await calculateTaadaFlag(
      app.student_id,
      app.cycle_year,
      app.bursary_type
    );

    // Calculate need score
    const scoreResult = await calculateNeedScore(applicationId, taadaResult.flag);

    // Update application
    await pool.query(
      `
      UPDATE applications
      SET taada_flag = $1, need_score = $2, updated_at = NOW()
      WHERE id = $3
      `,
      [taadaResult.flag, scoreResult.finalScore, applicationId]
    );

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
