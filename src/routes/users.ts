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

            // Transaction to ensure both user and admin profile are created
            const result = await db.transaction(async (tx) => {
                // 1. Create User with unified identity
                const userInsert = await tx.insert(usersTable).values({
                    email,
                    passwordHash: hashedPassword,
                    role: "ADMIN",
                    fullName: full_name,
                    isActive: true,
                    isVerified: true
                } as any).returning();

                const newUser = userInsert[0];

                // 2. Generate System ID (ADMIN-X) based on new role structure
                const adminCountRes = await tx.select({ val: count() })
                    .from(usersTable)
                    .where(eq(usersTable.role, "ADMIN"));
                
                const nextId = (Number(adminCountRes[0].val) || 0); // User is already inserted
                const systemId = `ADMIN-${nextId}`;

                // 3. Update User with systemId (optional, but keep in adminsTable for backup)
                await tx.update(usersTable).set({ systemId } as any).where(eq(usersTable.id, newUser.id));

                // 4. Create Admin Profile
                await tx.insert(adminsTable).values({
                    userId: newUser.id,
                    fullName: full_name,
                    systemId: systemId
                });

                return { ...newUser, systemId };
            });

            // 5. Send Welcome Email
            sendAdminWelcomeEmail(email, full_name, result.systemId, password);

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

// -------------------- GET all admins (Super Admin only) --------------------
router.get(
    "/admins",
    authMiddleware,
    roleMiddleware("SUPER_ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const admins = await db.select({
                id: usersTable.id,
                email: usersTable.email,
                fullName: usersTable.fullName,
                systemId: usersTable.systemId,
                isActive: usersTable.isActive,
                createdAt: usersTable.createdAt
            })
            .from(usersTable)
            .where(eq(usersTable.role, "ADMIN"));

            res.json({
                success: true,
                data: admins
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);

// -------------------- PATCH toggle admin status --------------------
router.patch(
    "/admin/:id/toggle",
    authMiddleware,
    roleMiddleware("SUPER_ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const idParam = Array.isArray(id) ? id[0] : id;
            
            const user = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(idParam as string, 10)));
            if (user.length === 0) {
                return res.status(404).json({ success: false, message: "User not found" });
            }

            const updated = await db.update(usersTable)
                .set({ isActive: !user[0].isActive })
                .where(eq(usersTable.id, parseInt(Array.isArray(id) ? id[0] : id as string, 10)))
                .returning();

            res.json({
                success: true,
                message: `Admin ${updated[0].isActive ? 'activated' : 'deactivated'} successfully`,
                data: updated[0]
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
);

// -------------------- DELETE admin --------------------
router.delete(
    "/admin/:id",
    authMiddleware,
    roleMiddleware("SUPER_ADMIN"),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            
            await db.delete(usersTable).where(eq(usersTable.id, parseInt(Array.isArray(id) ? id[0] : id as string, 10)));

            res.json({
                success: true,
                message: "Admin removed successfully"
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
            role: usersTable.role,
            fullName: usersTable.fullName,
            is_active: usersTable.isActive,
            created_at: usersTable.createdAt
        })
        .from(usersTable);
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
            role: usersTable.role,
            fullName: usersTable.fullName,
            is_active: usersTable.isActive,
            created_at: usersTable.createdAt
        })
        .from(usersTable)
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
        const { email, password, role, is_active, full_name } = req.body;

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.insert(usersTable).values({
            email,
            passwordHash: hashedPassword,
            role: role || "STUDENT",
            fullName: full_name,
            isActive: is_active ?? true
        } as any).returning({
            id: usersTable.id,
            email: usersTable.email,
            role: usersTable.role,
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
        const { email, password, role, is_active, full_name } = req.body;

        const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

        const updateData: any = {};
        if (email !== undefined) updateData.email = email;
        if (hashedPassword) updateData.passwordHash = hashedPassword;
        if (role !== undefined) updateData.role = role;
        if (full_name !== undefined) updateData.fullName = full_name;
        if (is_active !== undefined) updateData.isActive = is_active;

        const result = await db.update(usersTable)
            .set(updateData)
            .where(eq(usersTable.id, parseInt(id, 10)))
            .returning({
                id: usersTable.id,
                email: usersTable.email,
                role: usersTable.role,
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
