import { db } from "../src/db/db";
import { usersTable, rolesTable, adminsTable } from "../src/db/schema";
import { eq, isNull } from "drizzle-orm";

async function bootstrap() {
    try {
        console.log("Checking for super admins without profiles...");
        
        const superAdmins = await db.select({
            id: usersTable.id,
            email: usersTable.email
        })
        .from(usersTable)
        .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .where(eq(rolesTable.name, "SUPER_ADMIN"));

        for (const sa of superAdmins) {
            // Check if profile exists
            const profile = await db.select().from(adminsTable).where(eq(adminsTable.userId, sa.id));
            
            if (profile.length === 0) {
                console.log(`Creating profile for ${sa.email}...`);
                await db.insert(adminsTable).values({
                    userId: sa.id,
                    fullName: "Root Super Admin",
                    systemId: "SUPERADMIN-1"
                });
            } else if (!profile[0].systemId) {
                console.log(`Updating systemId for ${sa.email}...`);
                await db.update(adminsTable)
                    .set({ systemId: "SUPERADMIN-1" })
                    .where(eq(adminsTable.userId, sa.id));
            }
        }

        console.log("Bootstrap complete.");
        process.exit(0);
    } catch (err) {
        console.error("Bootstrap failed:", err);
        process.exit(1);
    }
}

bootstrap();
