import { db } from "../db/db";
import { usersTable, rolesTable } from "../db/schema";
import { eq } from "drizzle-orm";

async function promoteAllAdmins() {
    try {
        console.log("Searching for existing ADMINS to promote to SUPER_ADMIN...");

        // 2. Find and update
        const result = await db.update(usersTable)
            .set({ role: "SUPER_ADMIN" } as any)
            .where(eq(usersTable.role, "ADMIN"))
            .returning();

        if (result.length === 0) {
            console.log("No ADMIN users found to promote.");
        } else {
            console.log(`Successfully promoted ${result.length} user(s) to SUPER_ADMIN:`);
            result.forEach((u: any) => console.log(` - ${u.email}`));
        }
        
        process.exit(0);
    } catch (err) {
        console.error("Error during promotion:", err);
        process.exit(1);
    }
}

promoteAllAdmins();
