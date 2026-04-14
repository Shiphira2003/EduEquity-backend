-- Migration 015: Sync missing columns for Disbursements and Applications
-- Ensuring database matches schema.ts definitions

-- 1. Update Disbursements table
ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS fund_source VARCHAR(50) DEFAULT 'NATIONAL';
ALTER TABLE disbursements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Update Applications table
ALTER TABLE applications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
