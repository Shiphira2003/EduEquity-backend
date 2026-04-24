import { db } from './src/db/db';
import { usersTable, rolesTable } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function findAdmin() {
    const admins = await db.select({
        email: usersTable.email,
        role: rolesTable.name
    })
    .from(usersTable)
    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
    .where(eq(rolesTable.name, 'SUPER_ADMIN'));
    
    console.log('Found Admins:', JSON.stringify(admins, null, 2));
    process.exit(0);
}

findAdmin();
