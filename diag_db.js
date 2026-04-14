const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  await client.connect();
  try {
    console.log("Checking columns for 'disbursements' table...");
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'disbursements';
    `);
    console.log("Columns in 'disbursements':", res.rows);
    
    const fundSourceColumn = res.rows.find(c => c.column_name === 'fund_source');
    if (!fundSourceColumn) {
        console.error("CRITICAL: 'fund_source' column is MISSING in 'disbursements' table!");
    } else {
        console.log("'fund_source' column exists.");
    }

    const appExist = await client.query("SELECT id FROM applications WHERE id = 100");
    console.log("Application ID 100 exists:", appExist.rows.length > 0);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

check();
