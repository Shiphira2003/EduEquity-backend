import { db } from "./src/db/db";
import { usersTable, rolesTable, adminsTable } from "./src/db/schema";
import { eq, or } from "drizzle-orm";
import bcrypt from "bcrypt";

async function setupAdmins() {
  const adminEmails = ["wamaitha@gmail.com", "wanjiru@gmail.com"];
  const password = "Admin123!";
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // 1. Get ADMIN role ID
    const [adminRole] = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, "ADMIN"));
    if (!adminRole) {
      console.error("ADMIN role not found.");
      return;
    }

    const adminRoleId = adminRole.id;

    for (const email of adminEmails) {
      console.log(`Setting up admin for ${email}...`);
      
      // 2. Fetch or create user
      const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, email));
      
      let userId: number;
      if (existingUser) {
        console.log(`Updating existing user ${email}...`);
        await db.update(usersTable)
          .set({ 
            roleId: adminRoleId, 
            passwordHash: hashedPassword,
            isVerified: true,
            isActive: true
          })
          .where(eq(usersTable.id, existingUser.id));
        userId = existingUser.id;
      } else {
        console.log(`Creating new user ${email}...`);
        const [newUser] = await db.insert(usersTable).values({
          email,
          passwordHash: hashedPassword,
          roleId: adminRoleId,
          isVerified: true,
          isActive: true
        }).returning({ id: usersTable.id });
        userId = newUser.id;
      }

      // 3. Create or update admin profile
      const [existingAdmin] = await db.select().from(adminsTable).where(eq(adminsTable.userId, userId));
      
      const adminName = email.split('@')[0];
      const systemId = `ADMIN-${userId}`;

      if (existingAdmin) {
        console.log(`Updating admin profile for ${email}...`);
        await db.update(adminsTable)
          .set({ 
            fullName: adminName,
            systemId: systemId
          })
          .where(eq(adminsTable.userId, userId));
      } else {
        console.log(`Creating admin profile for ${email}...`);
        await db.insert(adminsTable).values({
          userId,
          fullName: adminName,
          systemId: systemId
        });
      }
    }
    
    console.log("Admin setup completed successfully.");
  } catch (err: any) {
    console.error("Admin setup failed:", err.message);
  }
}

setupAdmins();
