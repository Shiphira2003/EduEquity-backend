const { Client } = require('pg');
require('dotenv').config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function checkTypes() {
  await client.connect();
  try {
    const res = await client.query("SELECT typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'");
    console.log("Custom Types:", res.rows.map(r => r.typname));
    
    // Also check fund_sources table name enum
    const fsRes = await client.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'fund_sources'");
    console.log("Fund Sources columns:", fsRes.rows);
  } finally {
    await client.end();
  }
}

checkTypes();
