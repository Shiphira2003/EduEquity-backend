import pool from '../src/db/db';
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
        const roleRes = await pool.query("SELECT id FROM roles WHERE name = 'ADMIN'");
        if (roleRes.rowCount === 0) {
            console.error('Error: ADMIN role not found. Run init-db first.');
            process.exit(1);
        }
        const adminRoleId = roleRes.rows[0].id;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert admin
        const res = await pool.query(
            `INSERT INTO users (email, password_hash, role_id, is_active)
             VALUES ($1, $2, $3, true)
             RETURNING id, email`,
            [email, hashedPassword, adminRoleId]
        );

        console.log(`✅ Admin created successfully: ${res.rows[0].email}`);
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
