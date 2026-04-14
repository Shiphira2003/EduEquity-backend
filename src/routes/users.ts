// routes/users.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import { db } from "../db/db";
import { usersTable, rolesTable, adminsTable } from "../db/schema";
import { eq, count } from "drizzle-orm";
import { authMiddleware } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";
import { sendAdminWelcomeEmail } from "../services/email.service";

const router = Router();

// -------------------- POST register admin --------------------
router.post(
    "/admin",
    authMiddleware,
    roleMiddleware("SUPER_ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const { full_name, email, password } = req.body;

            if (!email || !password || !full_name) {
                return res.status(400).json({
                    success: false,
                    message: "All fields are required",
                });
            }

            // Check if email exists
            const exists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));

            if (exists.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: "Email already exists",
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            // Get admin role id
            const roleRes = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, "ADMIN"));

            if (roleRes.length === 0) {
                return res.status(500).json({
                    success: false,
                    message: "Admin role not found",
                });
            }

            const adminRoleId = roleRes[0].id;

            // Transaction to ensure both user and admin profile are created
            const result = await db.transaction(async (tx) => {
                // 1. Create User
                const userInsert = await tx.insert(usersTable).values({
                    email,
                    passwordHash: hashedPassword,
                    roleId: adminRoleId,
                    isActive: true,
                    isVerified: true // Admins are pre-verified by Super Admin
                }).returning();

                const newUser = userInsert[0];

                // 2. Generate System ID (ADMIN-X)
                const adminCountRes = await tx.select({ val: count() })
                    .from(adminsTable)
                    .innerJoin(usersTable, eq(adminsTable.userId, usersTable.id))
                    .innerJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
                    .where(eq(rolesTable.name, "ADMIN"));
                
                const nextId = (Number(adminCountRes[0].val) || 0) + 1;
                const systemId = `ADMIN-${nextId}`;

                // 3. Create Admin Profile
                await tx.insert(adminsTable).values({
                    userId: newUser.id,
                    fullName: full_name,
                    systemId: systemId
                });

                return { ...newUser, systemId };
            });

            // 4. Send Welcome Email
            sendAdminWelcomeEmail(email, full_name, result.systemId, password).catch(err => {
                console.error("Failed to send admin welcome email:", err);
            });

            res.status(201).json({
                success: true,
                message: "Admin registered successfully",
                data: result,
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);

// -------------------- GET all users --------------------
router.get("/", async (req: Request, res: Response) => {
    try {
        const result = await db.select({
            id: usersTable.id,
            email: usersTable.email,
            role_id: usersTable.roleId,
            is_active: usersTable.isActive,
            created_at: usersTable.createdAt,
            role_name: rolesTable.name
        })
        .from(usersTable)
        .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// -------------------- GET single user by id --------------------
router.get("/:id", async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const result = await db.select({
            id: usersTable.id,
            email: usersTable.email,
            role_id: usersTable.roleId,
            is_active: usersTable.isActive,
            created_at: usersTable.createdAt,
            role_name: rolesTable.name
        })
        .from(usersTable)
        .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .where(eq(usersTable.id, parseInt(id, 10)));

        if (result.length === 0) {
            return res.status(404).send("User not found");
        }

        res.json(result[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// -------------------- POST create a new user --------------------
router.post("/", async (req: Request, res: Response) => {
    try {
        const { email, password_hash, role_id, is_active } = req.body;

        // Hash the password
        const hashedPassword = await bcrypt.hash(password_hash, 10); // 10 salt rounds

        const result = await db.insert(usersTable).values({
            email,
            passwordHash: hashedPassword,
            roleId: role_id || null,
            isActive: is_active ?? true
        }).returning({
            id: usersTable.id,
            email: usersTable.email,
            role_id: usersTable.roleId,
            is_active: usersTable.isActive,
            created_at: usersTable.createdAt
        });

        res.status(201).json(result[0]);
    } catch (err: any) {
        console.error(err);
        if (err.code === "23505") { // unique violation
            return res.status(400).send("Email already exists");
        }
        res.status(500).send("Server error");
    }
});

// -------------------- PUT update a user --------------------
router.put("/:id", async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const { email, password_hash, role_id, is_active } = req.body;

        // Hash password if provided
        const hashedPassword = password_hash ? await bcrypt.hash(password_hash, 10) : null;

        const updateData: any = {};
        if (email !== undefined) updateData.email = email;
        if (hashedPassword) updateData.passwordHash = hashedPassword;
        if (role_id !== undefined) updateData.roleId = role_id;
        if (is_active !== undefined) updateData.isActive = is_active;

        const result = await db.update(usersTable)
            .set(updateData)
            .where(eq(usersTable.id, parseInt(id, 10)))
            .returning({
                id: usersTable.id,
                email: usersTable.email,
                role_id: usersTable.roleId,
                is_active: usersTable.isActive,
                created_at: usersTable.createdAt
            });

        if (result.length === 0) {
            return res.status(404).send("User not found");
        }

        res.json(result[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});


// -------------------- DELETE a user --------------------
router.delete("/:id", async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;

        const result = await db.delete(usersTable)
            .where(eq(usersTable.id, parseInt(id, 10)))
            .returning({ id: usersTable.id });

        if (result.length === 0) {
            return res.status(404).send("User not found");
        }

        res.json({ message: "User deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

export default router;
