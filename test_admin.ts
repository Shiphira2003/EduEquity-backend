import { db } from './src/db/db';
import { usersTable, rolesTable, adminsTable } from './src/db/schema';
import { eq, count } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function test() {
    try {
        const email = "testadmin@test.com";

        // Get admin role id
        const roleRes = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, "ADMIN"));
        const adminRoleId = roleRes[0].id;

        const hashedPassword = await bcrypt.hash("TEST", 10);
        const result = await db.transaction(async (tx) => {
            const userInsert = await tx.insert(usersTable).values({
                email,
                passwordHash: hashedPassword,
                roleId: adminRoleId,
                isActive: true,
                isVerified: true
            }).returning();

            const newUser = userInsert[0];

            const adminCountRes = await tx.select({ val: count() })
                .from(adminsTable)
                .innerJoin(usersTable, eq(adminsTable.userId, usersTable.id))
                .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
                .where(eq(rolesTable.name, "ADMIN"));
            
            const nextId = (Number(adminCountRes[0].val) || 0) + 1;
            const systemId = `ADMIN-${nextId}`;

            await tx.insert(adminsTable).values({
                userId: newUser.id,
                fullName: "Test Admin",
                systemId: systemId
            });

            return { ...newUser, systemId };
        });
        console.log("SUCCESS:", result);
    } catch(e) {
        console.error("ERROR:", e);
    }
}
test().then(() => process.exit(0));
