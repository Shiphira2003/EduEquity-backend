import { db } from './src/db/db';
import { rolesTable } from './src/db/schema';

async function run() {
    try {
        const roles = await db.select().from(rolesTable);
        console.log('--- ROLES ---');
        console.log(JSON.stringify(roles, null, 2));
    } catch (err) {
        console.error('Database query failed:', err);
    } finally {
        process.exit(0);
    }
}

run();
