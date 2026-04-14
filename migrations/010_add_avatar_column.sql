-- 010_add_avatar_column.sql
-- Add avatar selection support to students and admins

ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar VARCHAR(50);
-- In my system, admins already have image_icon, I'll repurpose it for the avatar ID string.
