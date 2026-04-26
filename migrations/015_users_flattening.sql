-- Migration 015: Users Table Flattening and Stabilization
-- This script aligns the 'users' table with the current Drizzle schema which expects a string-based role and unified identity fields.

-- 1. Add missing role column
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'STUDENT';

-- 2. Migrate data from role_id to role
UPDATE users SET role = 'ADMIN' WHERE role_id = 1;
UPDATE users SET role = 'STUDENT' WHERE role_id = 2;
UPDATE users SET role = 'COMMITTEE' WHERE role_id = 3;
UPDATE users SET role = 'SUPER_ADMIN' WHERE role_id = 4;

-- 3. Add other missing identity fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

-- 4. Ensure constraints and indexes match the schema
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_national_id_idx ON users(national_id);

-- Optional: Drop the legacy role_id column if you want to clean up
-- ALTER TABLE users DROP COLUMN IF EXISTS role_id;
