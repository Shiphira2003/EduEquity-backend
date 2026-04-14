import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────
// Mock the db module so no real DB connection is needed
// ─────────────────────────────────────────────
vi.mock('../db/db', () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
    },
}));

// ─────────────────────────────────────────────
// Unit: Pagination logic
// ─────────────────────────────────────────────
describe('Pagination Utility', () => {
    const computePagination = (page: number, limit: number, total: number) => ({
        offset: (page - 1) * limit,
        totalPages: Math.ceil(total / limit),
    });

    it('should compute correct offset for page 1', () => {
        const { offset } = computePagination(1, 10, 50);
        expect(offset).toBe(0);
    });

    it('should compute correct offset for page 3', () => {
        const { offset } = computePagination(3, 10, 50);
        expect(offset).toBe(20);
    });

    it('should compute correct total pages', () => {
        const { totalPages } = computePagination(1, 10, 55);
        expect(totalPages).toBe(6);
    });

    it('should return 1 page when total equals limit', () => {
        const { totalPages } = computePagination(1, 10, 10);
        expect(totalPages).toBe(1);
    });

    it('should return 0 pages when total is 0', () => {
        const { totalPages } = computePagination(1, 10, 0);
        expect(totalPages).toBe(0);
    });
});

// ─────────────────────────────────────────────
// Unit: Application status validation
// ─────────────────────────────────────────────
describe('Application Status Validation', () => {
    const VALID_STATUSES = ['APPROVED', 'REJECTED'];

    const validateStatus = (status: string) => VALID_STATUSES.includes(status);

    it('should accept APPROVED status', () => {
        expect(validateStatus('APPROVED')).toBe(true);
    });

    it('should accept REJECTED status', () => {
        expect(validateStatus('REJECTED')).toBe(true);
    });

    it('should reject PENDING as a transition target', () => {
        expect(validateStatus('PENDING')).toBe(false);
    });

    it('should reject arbitrary strings', () => {
        expect(validateStatus('FUNDED')).toBe(false);
        expect(validateStatus('')).toBe(false);
    });

    it('should enforce amount > 0 for APPROVED', () => {
        const validateApproval = (status: string, amount: number) =>
            status !== 'APPROVED' || amount > 0;

        expect(validateApproval('APPROVED', 5000)).toBe(true);
        expect(validateApproval('APPROVED', 0)).toBe(false);
        expect(validateApproval('APPROVED', -100)).toBe(false);
        expect(validateApproval('REJECTED', 0)).toBe(true); // rejections don't need amount
    });
});

// ─────────────────────────────────────────────
// Unit: TAADA flag determination logic
// ─────────────────────────────────────────────
describe('TAADA Flag Logic', () => {
    const determineTaadaFlag = (alreadyFunded: boolean, rejectedBefore: boolean) => {
        if (alreadyFunded) return 'ALREADY_FUNDED';
        if (rejectedBefore) return 'REJECTED_BEFORE';
        return 'FIRST_TIME';
    };

    it('should return ALREADY_FUNDED when student has prior disbursement', () => {
        expect(determineTaadaFlag(true, false)).toBe('ALREADY_FUNDED');
    });

    it('should return REJECTED_BEFORE when student has prior rejection', () => {
        expect(determineTaadaFlag(false, true)).toBe('REJECTED_BEFORE');
    });

    it('should return FIRST_TIME for new applicants', () => {
        expect(determineTaadaFlag(false, false)).toBe('FIRST_TIME');
    });

    it('should prioritize ALREADY_FUNDED over REJECTED_BEFORE', () => {
        expect(determineTaadaFlag(true, true)).toBe('ALREADY_FUNDED');
    });
});
