import { db } from '../src/db/db';
import { usersTable, rolesTable } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function seedAdmin() {
    const email = process.argv[2];
    const password = process.argv[3];

    if (!email || !password) {
        console.error('Usage: npx ts-node scripts/seed-admin.ts <email> <password>');
        process.exit(1);
    }

    try {
        // Check if admin role exists
        const roleRes = await db.select({ id: rolesTable.id })
            .from(rolesTable)
            .where(eq(rolesTable.name, 'ADMIN'));

        if (roleRes.length === 0) {
            console.error('Error: ADMIN role not found. Run init-db first.');
            process.exit(1);
        }
        const adminRoleId = roleRes[0].id;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert admin
        const [user] = await db.insert(usersTable).values({
            email,
            passwordHash: hashedPassword,
            roleId: adminRoleId,
            isActive: true,
        }).returning({
            id: usersTable.id,
            email: usersTable.email,
        });

        console.log(`✅ Admin created successfully: ${user.email}`);
        process.exit(0);
    } catch (err: any) {
        if (err.code === '23505') {
            console.error('Error: User with this email already exists.');
        } else {
            console.error('Error creating admin:', err);
        }
        process.exit(1);
    }
}

seedAdmin();
