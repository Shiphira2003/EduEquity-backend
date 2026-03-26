/**
 * Application Status Constants
 */
export const APPLICATION_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
} as const;

export type ApplicationStatus = typeof APPLICATION_STATUS[keyof typeof APPLICATION_STATUS];

/**
 * Disbursement Status Constants
 */
export const DISBURSEMENT_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    PROCESSED: 'PROCESSED',
} as const;

export type DisbursementStatus = typeof DISBURSEMENT_STATUS[keyof typeof DISBURSEMENT_STATUS];

/**
 * TAADA Flag Constants
 * (Tracks if a student has already been funded or rejected before)
 */
export const TAADA_FLAG = {
    FIRST_TIME: 'FIRST_TIME',
    ALREADY_FUNDED: 'ALREADY_FUNDED',
    REJECTED_BEFORE: 'REJECTED_BEFORE',
} as const;

export type TaadaFlag = typeof TAADA_FLAG[keyof typeof TAADA_FLAG];

/**
 * User Role Constants
 */
export const USER_ROLES = {
    ADMIN: 'ADMIN',
    STUDENT: 'STUDENT',
    COMMITTEE: 'COMMITTEE',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

/**
 * Bursary Type / Fund Source Constants
 */
export const BURSARY_TYPES = {
    MCA: 'MCA',
    CDF: 'CDF',
    COUNTY: 'COUNTY',
    NATIONAL: 'NATIONAL',
} as const;

export type BursaryType = typeof BURSARY_TYPES[keyof typeof BURSARY_TYPES];

/**
 * Cash Flow Transaction Types
 */
export const CASH_FLOW_TYPES = {
    ALLOCATION: 'ALLOCATION',
    DISBURSEMENT: 'DISBURSEMENT',
    REVERSAL: 'REVERSAL',
} as const;

export type CashFlowType = typeof CASH_FLOW_TYPES[keyof typeof CASH_FLOW_TYPES];

/**
 * HTTP Status Codes
 */
export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * API Error Messages
 */
export const ERROR_MESSAGES = {
    UNAUTHORIZED: 'Unauthorized - no token provided',
    INVALID_TOKEN: 'Invalid or expired token',
    FORBIDDEN: 'Access denied - insufficient permissions',
    NOT_FOUND: 'Resource not found',
    EMAIL_EXISTS: 'Email already exists',
    INVALID_CREDENTIALS: 'Invalid email or password',
    PASSWORD_MIN_LENGTH: 'Password must be at least 8 characters',
    MISSING_REQUIRED_FIELDS: 'Missing required fields',
    SERVER_ERROR: 'Internal server error',
} as const;
