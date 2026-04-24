import { Request, Response } from "express";

import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../db/db";
import { usersTable, rolesTable, passwordResetsTable, otpVerificationsTable, studentsTable, adminsTable } from "../db/schema";
import { eq, and, gt, count, desc } from "drizzle-orm";
import { config } from "../config/config";
import { sendEmail, sendOTPEmail, sendPasswordResetEmail } from "../services/email.service";

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Find user
        const userResult = await db.select({
            id: usersTable.id,
            email: usersTable.email,
            password_hash: usersTable.passwordHash,
            isActive: usersTable.isActive,
            isVerified: usersTable.isVerified,
            role_id: usersTable.roleId,
            role: rolesTable.name,
            systemId: adminsTable.systemId
        })
        .from(usersTable)
        .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
        .leftJoin(adminsTable, eq(usersTable.id, adminsTable.userId))
        .where(eq(usersTable.email, email));

        if (userResult.length === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = userResult[0];
        
        // Check if inactive/discontinued
        if (!user.isActive) {
            return res.status(403).json({ message: "Your account has been deactivated or discontinued. Please contact support." });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Check if verified
        if (!user.isVerified) {
            return res.status(403).json({ message: "Email not verified. Please verify your email first.", email: user.email });
        }

        // Generate Tokens
        const accessToken = jwt.sign(
            { userId: user.id, role: user.role, email: user.email, systemId: user.systemId },
            config().jwtSecret,
            { expiresIn: "15m" }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, role: user.role, email: user.email, systemId: user.systemId },
            config().jwtRefreshSecret,
            { expiresIn: "7d" }
        );

        res.cookie('jwt', refreshToken, {
            httpOnly: true, // accessible only by web server 
            secure: process.env.NODE_ENV === "production", // https
            sameSite: 'lax', // cross-site cookie 
            maxAge: 7 * 24 * 60 * 60 * 1000 // cookie expiry: set to match rT
        });

        // Fetch profile details based on role
        let fullName = "";
        let avatar = "";
        const systemId = user.systemId || "";

        if (user.role === "STUDENT") {
            const student = await db.select({ fullName: studentsTable.fullName, avatar: studentsTable.avatar })
                .from(studentsTable)
                .where(eq(studentsTable.userId, user.id))
                .limit(1);
            if (student.length > 0) {
                fullName = student[0].fullName;
                avatar = student[0].avatar || "";
            }
        } else if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
            const admin = await db.select({ fullName: adminsTable.fullName, avatar: adminsTable.imageIcon })
                .from(adminsTable)
                .where(eq(adminsTable.userId, user.id))
                .limit(1);
            if (admin.length > 0) {
                fullName = admin[0].fullName || "";
                avatar = admin[0].avatar || "";
            }
        }

        res.json({
            token: accessToken,
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                fullName,
                avatar,
                systemId
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const refresh = async (req: Request, res: Response) => {
    const cookies = req.cookies;

    if (!cookies?.jwt) return res.status(401).json({ message: "Unauthorized" });

    const refreshToken = cookies.jwt;

    jwt.verify(
        refreshToken,
        config().jwtRefreshSecret,
        async (err: any, decoded: any) => {
            if (err) return res.status(403).json({ message: "Forbidden" });

            const userResult = await db.select({ id: usersTable.id, email: usersTable.email, role_id: usersTable.roleId, role: rolesTable.name })
                .from(usersTable)
                .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
                .where(eq(usersTable.email, decoded.email));

            if (userResult.length === 0) return res.status(401).json({ message: "Unauthorized" });

            const user = userResult[0];

            const accessToken = jwt.sign(
                { userId: user.id, role: user.role, email: user.email },
                config().jwtSecret,
                { expiresIn: "15m" }
            );

            res.json({ 
                token: accessToken,
                accessToken 
            });
        }
    );
};

export const logout = (req: Request, res: Response) => {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204); // No content
    res.clearCookie('jwt', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === "production" });
    res.json({ message: "Cookie cleared" });
};

export const signup = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        // Check if email is already taken
        const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
        if (existing.length > 0) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // Determine role: first user becomes ADMIN, everyone else STUDENT
        const countResult = await db.select({ value: count() }).from(usersTable);
        const userCount = countResult[0].value;
        const roleName = userCount === 0 ? "SUPER_ADMIN" : "STUDENT";

        const roleResult = await db.select({ id: rolesTable.id }).from(rolesTable).where(eq(rolesTable.name, roleName));
        if (roleResult.length === 0) {
            return res.status(500).json({ message: `Role ${roleName} not found in database` });
        }
        const roleId = roleResult[0].id;

        // Hash password and insert user
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const userResult = await db.insert(usersTable).values({
            email,
            passwordHash: hashedPassword,
            roleId,
            isActive: true,
            isVerified: true
        }).returning({
            id: usersTable.id,
            email: usersTable.email,
            roleId: usersTable.roleId
        });

        const user = userResult[0];

        // send Welcome Email notification instead of OTP
        try {
            const { sendWelcomeEmail } = require("../services/email.service");
            sendWelcomeEmail(user.email, "User", "BursarHub Platform");
        } catch (emailErr) {
            console.error("Failed to send welcome email:", emailErr);
        }

        // Generate Tokens for seamless login
        const accessToken = jwt.sign(
            { userId: user.id, role: roleName, email: user.email },
            config().jwtSecret,
            { expiresIn: "15m" }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, role: roleName, email: user.email },
            config().jwtRefreshSecret,
            { expiresIn: "7d" }
        );

        res.cookie('jwt', refreshToken, {
            httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.status(201).json({
            message: `Account created successfully. Welcome to BursarHub!`,
            token: accessToken,
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                role: roleName,
            }
        });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const verifyOTP = async (req: Request, res: Response) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required" });

        const record = await db.select().from(otpVerificationsTable)
            .where(eq(otpVerificationsTable.email, email))
            .orderBy(desc(otpVerificationsTable.createdAt))
            .limit(1);

        if (record.length === 0) return res.status(400).json({ message: "No verification request found for this email" });

        const otpRecord = record[0];
        if (otpRecord.otp !== otp) return res.status(400).json({ message: "Invalid OTP" });
        if (new Date() > new Date(otpRecord.expiresAt)) return res.status(400).json({ message: "OTP has expired" });

        // OTP valid! Update user
        const updateResult = await db.update(usersTable)
            .set({ isVerified: true })
            .where(eq(usersTable.email, email))
            .returning();
            
        if (updateResult.length === 0) return res.status(404).json({ message: "User not found" });

        const userResult = await db.select({
            id: usersTable.id,
            email: usersTable.email,
            role: rolesTable.name
        }).from(usersTable).leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id)).where(eq(usersTable.email, email));

        const user = userResult[0];

        // Generate Tokens
        const accessToken = jwt.sign(
            { userId: user.id, role: user.role, email: user.email },
            config().jwtSecret,
            { expiresIn: "15m" }
        );

        const refreshToken = jwt.sign(
            { userId: user.id, role: user.role, email: user.email },
            config().jwtRefreshSecret,
            { expiresIn: "7d" }
        );

        res.cookie('jwt', refreshToken, {
            httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000
        });

        // Also delete the OTP records to clean up
        await db.delete(otpVerificationsTable).where(eq(otpVerificationsTable.email, email));

        // Fetch profile details based on role
        let fullName = "";
        let avatar = "";

        if (user.role === "STUDENT") {
            const student = await db.select({ fullName: studentsTable.fullName, avatar: studentsTable.avatar })
                .from(studentsTable)
                .where(eq(studentsTable.userId, user.id))
                .limit(1);
            if (student.length > 0) {
                fullName = student[0].fullName;
                avatar = student[0].avatar || "";
            }
        } else if (user.role === "ADMIN") {
            const admin = await db.select({ fullName: adminsTable.fullName, avatar: adminsTable.imageIcon })
                .from(adminsTable)
                .where(eq(adminsTable.userId, user.id))
                .limit(1);
            if (admin.length > 0) {
                fullName = admin[0].fullName || "";
                avatar = admin[0].avatar || "";
            }
        }

        res.json({
            message: "Email verified successfully!",
            token: accessToken,
            accessToken,
            user: { 
                id: user.id, 
                email: user.email, 
                role: user.role,
                fullName,
                avatar
            }
        });
    } catch (err) {
        console.error("Verify OTP error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const resendOTP = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const userResult = await db.select({ id: usersTable.id, isVerified: usersTable.isVerified }).from(usersTable).where(eq(usersTable.email, email));
        if (userResult.length === 0) return res.status(404).json({ message: "User not found" });
        if (userResult[0].isVerified) return res.status(400).json({ message: "Email is already verified" });

        // Generate new OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await db.insert(otpVerificationsTable).values({ email, otp, expiresAt });

        sendOTPEmail(email, otp);

        res.json({ message: "A new OTP has been sent to your email." });
    } catch (err) {
        console.error("Resend OTP error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Check if user exists
        const userResult = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
        if (userResult.length === 0) {
            // Security: Don't reveal if user exists
            return res.json({ message: "If an account with that email exists, a reset link has been sent." });
        }

        const user = userResult[0];

        // Generate reset token (random 6-digit code or long string)
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

        // Save to DB
        await db.insert(passwordResetsTable).values({
            userId: user.id,
            token,
            expiresAt
        });

        // Send Email using the new template helper
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/reset-password?token=${token}`;
        sendPasswordResetEmail(email, resetLink);

        res.json({ message: "If an account with that email exists, a reset link has been sent." });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        // Verify token
        const tokenResult = await db.select({ userId: passwordResetsTable.userId })
            .from(passwordResetsTable)
            .where(and(
                eq(passwordResetsTable.token, token),
                gt(passwordResetsTable.expiresAt, new Date())
            ));

        if (tokenResult.length === 0) {
            return res.status(400).json({ message: "Invalid or expired token" });
        }

        const { userId } = tokenResult[0];

        // Update Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await db.update(usersTable)
            .set({ passwordHash: hashedPassword })
            .where(eq(usersTable.id, userId));

        // Delete used token (and potentially all tokens for this user)
        await db.delete(passwordResetsTable)
            .where(eq(passwordResetsTable.userId, userId));

        res.json({ message: "Password reset successfully. You can now login." });

    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
