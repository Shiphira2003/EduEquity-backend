-- Use this SQL to create a Super Admin if not present
-- Email: admin@bursarhub.com
-- Password: password123 (hashed)

DO $$
DECLARE
    super_admin_role_id INT;
    admin_user_id INT;
BEGIN
    -- 1. Get SUPER_ADMIN role ID
    SELECT id INTO super_admin_role_id FROM roles WHERE name = 'SUPER_ADMIN';

    -- 2. Insert User if not exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@bursarhub.com') THEN
        INSERT INTO users (email, password_hash, role_id, is_active, is_verified)
        VALUES ('admin@bursarhub.com', '$2b$10$wD8p8Xf3/oZ7/C./l.u.Y.86wP8S5n9uL7G1V8e7U7G6L5w4d3u2i', super_admin_role_id, TRUE, TRUE)
        RETURNING id INTO admin_user_id;

        -- 3. Create Admin Profile
        INSERT INTO admins (user_id, full_name, system_id)
        VALUES (admin_user_id, 'Global Administrator', 'SYS-ADMIN-001');
        
        RAISE NOTICE '✅ Created Admin: admin@bursarhub.com / password123';
    ELSE
        RAISE NOTICE 'Admin user already exists.';
    END IF;
END $$;
