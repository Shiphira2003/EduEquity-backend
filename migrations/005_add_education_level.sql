-- Add education_level column with default TERTIARY
ALTER TABLE students ADD COLUMN IF NOT EXISTS education_level VARCHAR(50) DEFAULT 'TERTIARY';

-- Drop NOT NULL constraint on course column so it can be omitted by PRIMARY and SECONDARY students
ALTER TABLE students ALTER COLUMN course DROP NOT NULL;
