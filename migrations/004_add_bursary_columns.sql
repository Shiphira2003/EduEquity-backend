-- ============================================================
-- Migration 004: Add missing columns to applications table
--                and create need_assessment table if missing
-- ============================================================

-- 1. Add bursary_type column to applications (VARCHAR to match existing schema style)
ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS bursary_type VARCHAR(50) DEFAULT 'NATIONAL';

-- 2. Add need_score column to applications
ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS need_score DECIMAL(5, 2) DEFAULT 0;

-- 3. Add rejection_reason column to applications
ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(500);

-- 4. Create need_assessment table if not already present
CREATE TABLE IF NOT EXISTS need_assessment (
    id                    SERIAL PRIMARY KEY,
    application_id        INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    family_income         DECIMAL(12, 2),
    dependents            INTEGER DEFAULT 0,
    orphaned              BOOLEAN DEFAULT FALSE,
    disabled              BOOLEAN DEFAULT FALSE,
    other_hardships       TEXT,
    academic_score        DECIMAL(5, 2),
    need_score_percentage DECIMAL(5, 2) DEFAULT 0,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Add reference_number to disbursements (needed for payment ref emails)
ALTER TABLE disbursements
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(50);

-- 6. Add disbursed_at if missing (may already exist)
ALTER TABLE disbursements
    ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMP;
