import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function config() {
  return {
    port: process.env.PORT ? Number(process.env.PORT) : 5000,
    env: process.env.NODE_ENV || "development",

    // PostgreSQL config
    dbUrl: process.env.DATABASE_URL,
    dbUser: process.env.DB_USER,
    dbPassword: process.env.DB_PASSWORD,
    dbHost: process.env.DB_HOST || "localhost",
    dbPort: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    dbName: process.env.DB_NAME,

    // JWT secret
    jwtSecret: requireEnv("JWT_SECRET"),
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || requireEnv("JWT_SECRET") + "_refresh",

    // Email Config
    emailUser: process.env.EMAIL_USER,
    emailPass: process.env.EMAIL_PASS,
  };
}
