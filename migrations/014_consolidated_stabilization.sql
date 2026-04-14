-- Migration 014: Consolidated Stabilization
-- This script ensures all tables have the columns required by the updated 2026 Bursary Portal logic

-- Users Table: Add is_verified (needed for Super Admin provisioning)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Students Table: Add regional data (Smart Autofill) and identity fields
ALTER TABLE students ADD COLUMN IF NOT EXISTS county VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS constituency VARCHAR(100);
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar VARCHAR(50);
