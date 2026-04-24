-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS cash_flow_records CASCADE;
DROP TABLE IF EXISTS need_assessment CASCADE;
DROP TABLE IF EXISTS fund_sources CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS disbursements CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- Type definitions (if using native enums, though Drizzle often handles this via VARCHAR in simple setups)
-- For this SQL, we'll use VARCHAR with CHECK constraints to match the Drizzle Enums

-- 1. Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);
CREATE UNIQUE INDEX roles_name_idx ON roles(name);

-- 2. Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX users_email_idx ON users(email);

-- 3. Students
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    national_id VARCHAR(50) UNIQUE NOT NULL,
    institution VARCHAR(255) NOT NULL,
    education_level VARCHAR(50) DEFAULT 'TERTIARY',
    course VARCHAR(255),
    year_of_study INTEGER NOT NULL,
    school_bank_name VARCHAR(255),
    school_account_number VARCHAR(100),
    county VARCHAR(100),
    constituency VARCHAR(100),
    is_bank_locked BOOLEAN DEFAULT FALSE,
    avatar VARCHAR(50),
    -- Socioeconomic fields
    family_income DECIMAL(12, 2),
    dependents INTEGER DEFAULT 0,
    orphaned BOOLEAN DEFAULT FALSE,
    disabled BOOLEAN DEFAULT FALSE,
    academic_score DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX students_user_id_idx ON students(user_id);
CREATE UNIQUE INDEX students_national_id_idx ON students(national_id);

-- 4. Applications
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    cycle_year INTEGER NOT NULL,
    bursary_type VARCHAR(50) DEFAULT 'NATIONAL',
    county VARCHAR(100),
    constituency VARCHAR(100),
    need_score DECIMAL(5, 2) DEFAULT 0,
    amount_requested DECIMAL(12, 2) NOT NULL,
    fee_balance DECIMAL(12, 2) DEFAULT 0,
    amount_allocated DECIMAL(12, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'PENDING',
    taada_flag VARCHAR(50) DEFAULT 'FIRST_TIME',
    document_url TEXT,
    rejection_reason VARCHAR(500),
    -- Snapshots
    institution VARCHAR(255),
    course VARCHAR(255),
    year_of_study INTEGER,
    education_level VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX student_id_idx ON applications(student_id);
CREATE INDEX bursary_type_idx ON applications(bursary_type);

-- 5. Disbursements
CREATE TABLE disbursements (
    id SERIAL PRIMARY KEY,
    allocation_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    fund_source VARCHAR(50) DEFAULT 'NATIONAL',
    amount DECIMAL(12, 2) NOT NULL,
    reference_number VARCHAR(50),
    status VARCHAR(50) DEFAULT 'PENDING',
    disbursed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX allocation_id_idx ON disbursements(allocation_id);
CREATE INDEX fund_source_idx ON disbursements(fund_source);

-- 6. Audit Logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_application_id_idx ON audit_logs(application_id);

-- 7. Fund Sources
CREATE TABLE fund_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description VARCHAR(500),
    budget_per_cycle DECIMAL(12, 2) NOT NULL,
    cycle_year INTEGER NOT NULL,
    allocated_amount DECIMAL(12, 2) DEFAULT 0,
    disbursed_amount DECIMAL(12, 2) DEFAULT 0,
    is_open BOOLEAN DEFAULT FALSE,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX fund_source_name_year_idx ON fund_sources(name, cycle_year);

-- 8. Need Assessment
CREATE TABLE need_assessment (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
    family_income DECIMAL(12, 2),
    dependents INTEGER DEFAULT 0,
    orphaned BOOLEAN DEFAULT FALSE,
    disabled BOOLEAN DEFAULT FALSE,
    other_hardships TEXT,
    academic_score DECIMAL(5, 2),
    need_score_percentage DECIMAL(5, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX assessment_app_id_idx ON need_assessment(application_id);

-- 9. Cash Flow Records
CREATE TABLE cash_flow_records (
    id SERIAL PRIMARY KEY,
    disbursement_id INTEGER REFERENCES disbursements(id) ON DELETE CASCADE,
    fund_source VARCHAR(50) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    balance_before DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    reference_id VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX cf_fund_source_idx ON cash_flow_records(fund_source);
CREATE INDEX cf_created_at_idx ON cash_flow_records(created_at);

-- 10. Notifications
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notifications_user_id_idx ON notifications(user_id);

-- 11. Announcements
CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Admins
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    id_number VARCHAR(50),
    image_icon TEXT,
    system_id VARCHAR(50) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX admins_user_id_idx ON admins(user_id);

-- 13. OTP Verifications
CREATE TABLE otp_verifications (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX otp_email_idx ON otp_verifications(email);

-- 14. Password Resets
CREATE TABLE password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX password_resets_token_idx ON password_resets(token);
CREATE INDEX pr_user_id_idx ON password_resets(user_id);

-- SEED DATA
INSERT INTO roles (name) VALUES ('ADMIN'), ('STUDENT'), ('COMMITTEE'), ('SUPER_ADMIN');

-- Initial Fund Sources for 2026 (Demo ready)
INSERT INTO fund_sources (name, description, budget_per_cycle, cycle_year, is_open) VALUES 
('NATIONAL', 'National Government Bursary Fund 2026', 1000000.00, 2026, TRUE),
('CDF', 'Constituency Development Fund 2026', 500000.00, 2026, TRUE),
('COUNTY', 'County Executive Bursary 2026', 400000.00, 2026, TRUE),
('MCA', 'Ward Development Fund 2026', 200000.00, 2026, TRUE);
