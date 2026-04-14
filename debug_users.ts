import { db } from './src/db/db';
import { usersTable, rolesTable } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function run() {
    try {
        const users = await db.select({
            id: usersTable.id,
            email: usersTable.email,
            role: rolesTable.name,
            isVerified: usersTable.isVerified
        })
        .from(usersTable)
        .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id));
        
        console.log('--- ALL USERS ---');
        console.log(JSON.stringify(users, null, 2));
    } catch (err) {
        console.error('Database query failed:', err);
    } finally {
        process.exit(0);
    }
}

run();
