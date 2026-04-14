-- Add school bank details and lock flag to the students table
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS school_bank_name VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS school_account_number VARCHAR(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_bank_locked BOOLEAN DEFAULT FALSE;
