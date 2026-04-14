-- ============================================================
-- Migration 006: Add fund_sources (if missing) + fee_balance
-- ============================================================

CREATE TABLE IF NOT EXISTS fund_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(500),
    budget_per_cycle DECIMAL(12, 2) NOT NULL,
    cycle_year INTEGER NOT NULL,
    allocated_amount DECIMAL(12, 2) DEFAULT 0,
    disbursed_amount DECIMAL(12, 2) DEFAULT 0,
    is_open BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (name, cycle_year)
);

ALTER TABLE fund_sources ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT FALSE;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS fee_balance DECIMAL(12, 2) NOT NULL DEFAULT 0;
