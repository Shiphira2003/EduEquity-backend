import { Request, Response, NextFunction } from "express";

// ============================================
// VALIDATION UTILITIES
// ============================================

export class ValidationError extends Error {
  constructor(public errors: Record<string, string>) {
    super("Validation failed");
    this.name = "ValidationError";
  }
}

/**
 * Validates email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

/**
 * Validates password strength
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 */
export const isValidPassword = (password: string): boolean => {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
};

/**
 * Validates phone number (Kenyan format)
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^(\+254|0)[1-9]\d{8}$/;
  return phoneRegex.test(phone);
};

/**
 * Validates national ID (Kenyan format)
 */
export const isValidNationalId = (id: string): boolean => {
  // Kenya national ID: 8 digits
  const idRegex = /^\d{8}$/;
  return idRegex.test(id);
};

/**
 * Validates amount (decimal: max 12 digits, 2 decimal places)
 */
export const isValidAmount = (amount: any): boolean => {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) return false;
  if (num > 999999999999.99) return false; // Max 12 digits, 2 decimals
  return true;
};

/**
 * Validates year of study (1-8)
 */
export const isValidYearOfStudy = (year: any): boolean => {
  const y = parseInt(year);
  return y >= 1 && y <= 8;
};

/**
 * Validates cycle year (current year or future)
 */
export const isValidCycleYear = (year: any): boolean => {
  const y = parseInt(year);
  return y >= 2020 && y <= 2035;
};

/**
 * Validates percentage (0-100)
 */
export const isValidPercentage = (percentage: any): boolean => {
  const p = parseFloat(percentage);
  return !isNaN(p) && p >= 0 && p <= 100;
};

/**
 * Validates that a value is not empty
 */
export const isNotEmpty = (value: any): boolean => {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
};

/**
 * Validates string length
 */
export const isValidLength = (
  value: string,
  min: number,
  max: number
): boolean => {
  return value.length >= min && value.length <= max;
};

// ============================================
// VALIDATION MIDDLEWARE FACTORIES
// ============================================

/**
 * Validates student registration/profile data
 */
export const validateStudentProfile = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors: Record<string, string> = {};
  const { full_name, national_id, institution, course, year_of_study } = req.body;

  if (!isNotEmpty(full_name)) {
    errors.full_name = "Full name is required";
  } else if (!isValidLength(full_name, 1, 255)) {
    errors.full_name = "Full name must be between 1 and 255 characters";
  }

  if (!isNotEmpty(national_id)) {
    errors.national_id = "National ID is required";
  } else if (!isValidNationalId(national_id)) {
    errors.national_id = "National ID must be 8 digits";
  }

  if (!isNotEmpty(institution)) {
    errors.institution = "Institution is required";
  } else if (!isValidLength(institution, 1, 255)) {
    errors.institution = "Institution name must be between 1 and 255 characters";
  }

  if (!isNotEmpty(course)) {
    errors.course = "Course is required";
  } else if (!isValidLength(course, 1, 255)) {
    errors.course = "Course name must be between 1 and 255 characters";
  }

  if (!isNotEmpty(year_of_study)) {
    errors.year_of_study = "Year of study is required";
  } else if (!isValidYearOfStudy(year_of_study)) {
    errors.year_of_study = "Year of study must be between 1 and 8";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};

/**
 * Validates application submission data
 */
export const validateApplicationSubmission = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors: Record<string, string> = {};
  const { cycle_year, amount_requested, bursary_type } = req.body;

  if (!isNotEmpty(cycle_year)) {
    errors.cycle_year = "Cycle year is required";
  } else if (!isValidCycleYear(cycle_year)) {
    errors.cycle_year = "Cycle year must be current year or future";
  }

  if (!isNotEmpty(amount_requested)) {
    errors.amount_requested = "Amount requested is required";
  } else if (!isValidAmount(amount_requested)) {
    errors.amount_requested = "Amount must be a positive decimal (max 12 digits)";
  }

  if (bursary_type) {
    const validBursaryTypes = ["MCA", "CDF", "COUNTY", "NATIONAL"];
    if (!validBursaryTypes.includes(bursary_type)) {
      errors.bursary_type = `Bursary type must be one of: ${validBursaryTypes.join(", ")}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};

/**
 * Validates need assessment data
 */
export const validateNeedAssessment = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors: Record<string, string> = {};
  const {
    family_income,
    dependents,
    orphaned,
    disabled,
    academic_score,
  } = req.body;

  if (family_income !== undefined && !isValidAmount(family_income)) {
    errors.family_income = "Family income must be a positive decimal";
  }

  if (dependents !== undefined) {
    const d = parseInt(dependents);
    if (isNaN(d) || d < 0 || d > 20) {
      errors.dependents = "Dependents must be between 0 and 20";
    }
  }

  if (typeof orphaned !== "boolean" && orphaned !== undefined) {
    errors.orphaned = "Orphaned must be a boolean";
  }

  if (typeof disabled !== "boolean" && disabled !== undefined) {
    errors.disabled = "Disabled must be a boolean";
  }

  if (academic_score !== undefined && !isValidPercentage(academic_score)) {
    errors.academic_score = "Academic score must be between 0 and 100";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};

/**
 * Validates disbursement data
 */
export const validateDisbursement = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors: Record<string, string> = {};
  const { allocation_id, amount, fund_source, status } = req.body;

  if (!isNotEmpty(allocation_id)) {
    errors.allocation_id = "Allocation ID is required";
  } else if (isNaN(parseInt(allocation_id))) {
    errors.allocation_id = "Allocation ID must be a number";
  }

  if (!isNotEmpty(amount)) {
    errors.amount = "Amount is required";
  } else if (!isValidAmount(amount)) {
    errors.amount = "Amount must be a positive decimal (max 12 digits)";
  }

  if (fund_source) {
    const validSources = ["MCA", "CDF", "COUNTY", "NATIONAL"];
    if (!validSources.includes(fund_source)) {
      errors.fund_source = `Fund source must be one of: ${validSources.join(", ")}`;
    }
  }

  if (status) {
    const validStatus = ["PENDING", "APPROVED", "PROCESSED"];
    if (!validStatus.includes(status)) {
      errors.status = `Status must be one of: ${validStatus.join(", ")}`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};

/**
 * Validates login data
 */
export const validateLogin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors: Record<string, string> = {};
  const { email, password } = req.body;

  if (!isNotEmpty(email)) {
    errors.email = "Email is required";
  } else if (!isValidEmail(email)) {
    errors.email = "Invalid email format";
  }

  if (!isNotEmpty(password)) {
    errors.password = "Password is required";
  } else if (password.length < 6) {
    errors.password = "Password must be at least 6 characters";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};

/**
 * Validates registration data
 */
export const validateRegistration = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors: Record<string, string> = {};
  const { email, password, password_confirm } = req.body;

  if (!isNotEmpty(email)) {
    errors.email = "Email is required";
  } else if (!isValidEmail(email)) {
    errors.email = "Invalid email format";
  }

  if (!isNotEmpty(password)) {
    errors.password = "Password is required";
  } else if (!isValidPassword(password)) {
    errors.password =
      "Password must have at least 8 characters, uppercase, lowercase, and number";
  }

  if (password !== password_confirm) {
    errors.password_confirm = "Passwords do not match";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};

/**
 * Validates fund source configuration data
 */
export const validateFundSource = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors: Record<string, string> = {};
  const { name, budget_per_cycle, cycle_year } = req.body;

  const validNames = ["MCA", "CDF", "COUNTY", "NATIONAL"];
  if (!isNotEmpty(name)) {
    errors.name = "Fund source name is required";
  } else if (!validNames.includes(name)) {
    errors.name = `Fund source must be one of: ${validNames.join(", ")}`;
  }

  if (!isNotEmpty(budget_per_cycle)) {
    errors.budget_per_cycle = "Budget per cycle is required";
  } else if (!isValidAmount(budget_per_cycle)) {
    errors.budget_per_cycle = "Budget must be a positive decimal";
  }

  if (!isNotEmpty(cycle_year)) {
    errors.cycle_year = "Cycle year is required";
  } else if (!isValidCycleYear(cycle_year)) {
    errors.cycle_year = "Cycle year must be current year or future";
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors,
    });
  }

  next();
};
