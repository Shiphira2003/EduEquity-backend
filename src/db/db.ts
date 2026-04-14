import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { config } from "../config/config"; // adjust path if needed

// Create PostgreSQL pool using config
const poolConfig: any = config().dbUrl
  ? {
    connectionString: config().dbUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  }
  : {
    user: config().dbUser,
    host: config().dbHost,
    database: config().dbName,
    password: config().dbPassword,
    port: config().dbPort,
  };

const pool = new Pool(poolConfig);
const db = drizzle({ client: pool, schema });

// Test connection immediately
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ Connected to PostgreSQL successfully!");
    client.release();
  } catch (err) {
    console.error("❌ Error connecting to PostgreSQL:", err);
  }
})();

export { pool, db };
export default pool;
