import { db } from "../db/db";
import { usersTable, rolesTable, adminsTable } from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

async function createSuperAdmin() {
    const email = "lizen@gmail.com";
    const password = "Admin123!";
    const fullName = "System Super Admin";

    try {
        console.log(`Setting up super admin: ${email}...`);

        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. Check if user exists
        const existing = await db.select()
            .from(usersTable)
            .where(eq(usersTable.email, email));

        let userId: number;

        if (existing.length > 0) {
            console.log("User exists. Updating password and role...");
            const updated = await db.update(usersTable)
                .set({
                    passwordHash: hashedPassword,
                    role: "SUPER_ADMIN",
                    fullName,
                    systemId: "SUPER-01",
                    isActive: true,
                    isVerified: true
                } as any)
                .where(eq(usersTable.email, email))
                .returning();
            userId = updated[0].id;
        } else {
            console.log("User does not exist. Creating new super admin...");
            const inserted = await db.insert(usersTable)
                .values({
                    email,
                    passwordHash: hashedPassword,
                    role: "SUPER_ADMIN",
                    fullName,
                    systemId: "SUPER-01",
                    isActive: true,
                    isVerified: true
                } as any)
                .returning();
            userId = inserted[0].id;
        }

        // 3. Ensure Admin Profile exists
        const profileExisting = await db.select()
            .from(adminsTable)
            .where(eq(adminsTable.userId, userId));

        if (profileExisting.length === 0) {
            console.log("Creating admin profile...");
            await db.insert(adminsTable).values({
                userId,
                fullName,
                systemId: "SUPER-01"
            });
        } else {
            console.log("Admin profile already exists.");
        }

        console.log("-----------------------------------------");
        console.log("✅ Super Admin setup successfully!");
        console.log(`Email: ${email}`);
        console.log(`Password: ${password} (Hashed in DB)`);
        console.log("Role: SUPER_ADMIN");
        console.log("-----------------------------------------");

        process.exit(0);
    } catch (err) {
        console.error("Failed to setup super admin:", err);
        process.exit(1);
    }
}

createSuperAdmin();
