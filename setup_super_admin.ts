import { db } from './src/db/db';
import { usersTable } from './src/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function run() {
    const email = 'lizen@gmail.com';
    const newPassword = 'Admin123!';
    
    try {
        console.log(`Setting up Super Admin for: ${email}`);
        
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const result = await db.update(usersTable)
            .set({ 
                roleId: 4, // SUPER_ADMIN
                isVerified: true,
                isActive: true,
                passwordHash: hashedPassword
            })
            .where(eq(usersTable.email, email))
            .returning();
            
        if (result.length > 0) {
            console.log('✅ Super Admin setup successfully!');
            console.log(JSON.stringify(result[0], null, 2));
        } else {
            console.error('❌ User not found!');
        }
    } catch (err) {
        console.error('❌ Database update failed:', err);
    } finally {
        process.exit(0);
    }
}

run();
