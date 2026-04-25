import { db } from './src/db/db';
import { usersTable, rolesTable } from './src/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function seedAdmin() {
    try {
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        const rolesToSeed = ['SUPER_ADMIN', 'ADMIN', 'STUDENT'];
        for (const roleName of rolesToSeed) {
            const res = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, roleName));
            if (res.length === 0) {
                console.log(`${roleName} role not found. Creating it...`);
                await db.insert(rolesTable).values({ name: roleName });
            }
        }
        
        // 1. Get role ID for SUPER_ADMIN
        const roleRes = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, 'SUPER_ADMIN'));
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
