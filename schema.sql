-- Drop tables if they exist to start fresh (optional, be careful in prod)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS disbursements CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- 1. Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- Seed Roles
INSERT INTO roles (name) VALUES ('ADMIN'), ('STUDENT'), ('COMMITTEE');

-- 2. Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Students
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    national_id VARCHAR(50) UNIQUE NOT NULL,
    institution VARCHAR(255) NOT NULL,
    course VARCHAR(255) NOT NULL,
    year_of_study INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Applications
CREATE TABLE applications (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    cycle_year INTEGER NOT NULL,
    amount_requested DECIMAL(12, 2) NOT NULL,
    amount_allocated DECIMAL(12, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    taada_flag VARCHAR(50) DEFAULT 'FIRST_TIME', -- FIRST_TIME, ALREADY_FUNDED, REJECTED_BEFORE
    document_url TEXT, -- Stores JSON string of file paths
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Disbursements
CREATE TABLE disbursements (
    id SERIAL PRIMARY KEY,
    allocation_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, PROCESSED
    disbursed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Audit Logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
