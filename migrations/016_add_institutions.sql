-- Migration: 016_add_institutions.sql
CREATE TABLE IF NOT EXISTS "institutions" (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(255) NOT NULL UNIQUE,
    "code" VARCHAR(50),
    "category" VARCHAR(50),
    "created_at" TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "institutions_name_idx" ON "institutions" ("name");
