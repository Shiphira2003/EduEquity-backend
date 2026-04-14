-- Migration 007: Add timeline dates to fund_sources

ALTER TABLE fund_sources ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;
ALTER TABLE fund_sources ADD COLUMN IF NOT EXISTS end_date TIMESTAMP;
