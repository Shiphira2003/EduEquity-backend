# EduEquity — Backend

A Node.js + Express + PostgreSQL backend for managing county bursary fund applications, disbursements, and student records.

## Prerequisites

- **Node.js** v18+
- **PostgreSQL** v14+
- **npm** v9+

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Shiphira2003/project-backend.git
cd project-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file and fill in your own values:

```bash
cp .env.example .env
```

Open `.env` and update:

| Variable      | Description                     | Required |
|---------------|---------------------------------|----------|
| `DB_USER`     | PostgreSQL username             | ✅       |
| `DB_PASSWORD` | PostgreSQL password             | ✅       |
| `DB_HOST`     | Database host (default: localhost) | ❌    |
| `DB_PORT`     | Database port (default: 5432)   | ❌       |
| `DB_NAME`     | Database name                   | ✅       |
| `JWT_SECRET`  | Secret key for JWT tokens       | ✅       |
| `EMAIL_USER`  | Email for sending notifications | ❌       |
| `EMAIL_PASS`  | Email app password              | ❌       |

### 4. Create the PostgreSQL database

Connect to PostgreSQL and create your database:

```bash
psql -U postgres
```

```sql
CREATE DATABASE cfg_db;
\q
```

> Replace `cfg_db` with whatever name you set in `DB_NAME`.

### 5. Set up database tables

Run the full database setup (schema + all migrations) in one command:

```bash
npm run db:setup
```

This uses **Drizzle ORM** to create all tables and apply all incremental migrations (`001-009`) sequentially, then seeds initial roles.

### 6. Start the development server

```bash
npm run dev
```

The server starts at `http://localhost:5000` (or your configured `PORT`).

## First User = Admin

The **first person to sign up** via `POST /api/auth/signup` automatically becomes an **ADMIN**. All subsequent signups are assigned the **STUDENT** role.

## Available Scripts

| Script             | Description                                     |
|--------------------|-------------------------------------------------|
| `npm run dev`      | Start the dev server with hot reload            |
| `npm run db:setup` | Run full database setup (schema + all migrations) |
| `npm run db:migrate` | Run only the base schema (via Drizzle)        |
| `npm run db:migrate:run` | Run all incremental migrations sequentially |

## API Routes

| Route                | Method | Description                |
|----------------------|--------|----------------------------|
| `/`                  | GET    | Health check               |
| `/api/auth/signup`   | POST   | Register (first = admin)   |
| `/api/auth/login`    | POST   | Login                      |
| `/api/auth/forgot-password` | POST | Request password reset |
| `/api/auth/reset-password`  | POST | Reset password with token |
| `/api/users`         | —      | User management            |
| `/api/students`      | —      | Student CRUD               |
| `/api/register`      | POST   | Admin registers a user     |
| `/api/applications`  | —      | Bursary applications       |

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express 5
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (via `pg`)
- **Auth:** JWT + bcrypt
- **Email:** Nodemailer
