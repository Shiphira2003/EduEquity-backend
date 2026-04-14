-- Migration: Add SUPER_ADMIN role
-- 1. Update the userRole enum in the database (Only if using Enums; we use roles table)
-- ALTER TYPE "userRole" ADD VALUE 'SUPER_ADMIN';

-- 2. Insert the SUPER_ADMIN role into the roles table
INSERT INTO "roles" (name) VALUES ('SUPER_ADMIN') ON CONFLICT (name) DO NOTHING;
