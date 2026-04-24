import { db } from './src/db/db';
import { usersTable, rolesTable } from './src/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function seedAdmin() {
    try {
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        // 1. Get role ID for SUPER_ADMIN
        const roleRes = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, 'SUPER_ADMIN'));
        if (roleRes.length === 0) {
            console.log('SUPER_ADMIN role not found. Creating it...');
            const newRole = await db.insert(rolesTable).values({ name: 'SUPER_ADMIN' }).returning({ id: rolesTable.id });
            roleRes.push(newRole[0]);
        }
        
        const roleId = roleRes[0].id;
        
        // 2. Insert admin@bursarhub.com
        const existing = await db.select().from(usersTable).where(eq(usersTable.email, 'admin@bursarhub.com'));
        if (existing.length === 0) {
            await db.insert(usersTable).values({
                email: 'admin@bursarhub.com',
                passwordHash: hashedPassword,
                roleId: roleId,
                isActive: true,
                isVerified: true
            });
            console.log('✅ Admin user created: admin@bursarhub.com / password123');
        } else {
            console.log('Admin user already exists.');
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

seedAdmin();
