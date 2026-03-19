import { Request, Response } from "express";

import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import pool from "../db/db";
import { config } from "../config/config";
import { sendEmail } from "../services/email.service";

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Find user
        const userResult = await pool.query(
            `SELECT u.id, u.email, u.password_hash, u.role_id, r.name as role
             FROM users u
             JOIN roles r ON u.role_id = r.id
             WHERE u.email = $1`,
            [email]
        );

        if (userResult.rowCount === 0) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const user = userResult.rows[0];

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role, email: user.email },
            config().jwtSecret,
            { expiresIn: "24h" }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
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
        const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.rowCount! > 0) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // Determine role: first user becomes ADMIN, everyone else STUDENT
        const countResult = await pool.query("SELECT COUNT(*) FROM users");
        const userCount = parseInt(countResult.rows[0].count, 10);
        const roleName = userCount === 0 ? "ADMIN" : "STUDENT";

        const roleResult = await pool.query("SELECT id FROM roles WHERE name = $1", [roleName]);
        if (roleResult.rowCount === 0) {
            return res.status(500).json({ message: `Role ${roleName} not found in database` });
        }
        const roleId = roleResult.rows[0].id;

        // Hash password and insert user
        const hashedPassword = await bcrypt.hash(password, 10);
        const userResult = await pool.query(
            `INSERT INTO users (email, password_hash, role_id, is_active)
             VALUES ($1, $2, $3, true)
             RETURNING id, email, role_id`,
            [email, hashedPassword, roleId]
        );

        const user = userResult.rows[0];

        // Issue JWT so the user is immediately logged in
        const token = jwt.sign(
            { userId: user.id, role: roleName, email: user.email },
            config().jwtSecret,
            { expiresIn: "24h" }
        );

        return res.status(201).json({
            message: `Account created successfully as ${roleName}`,
            token,
            user: {
                id: user.id,
                email: user.email,
                role: roleName,
            },
        });
    } catch (error) {
        console.error("Signup error:", error);
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
        const userResult = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (userResult.rowCount === 0) {
            // Security: Don't reveal if user exists
            return res.json({ message: "If an account with that email exists, a reset link has been sent." });
        }

        const user = userResult.rows[0];

        // Generate reset token (random 6-digit code or long string)
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

        // Save to DB
        await pool.query(
            "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)",
            [user.id, token, expiresAt]
        );

        // Send Email
        const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/reset-password?token=${token}`;
        const emailHtml = `
            <h3>Password Reset Request</h3>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <a href="${resetLink}">Reset Password</a>
            <p>This link expires in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
        `;

        await sendEmail(email, "Password Reset Request", emailHtml);

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
        const tokenResult = await pool.query(
            "SELECT user_id, expires_at FROM password_resets WHERE token = $1 AND expires_at > NOW()",
            [token]
        );

        if (tokenResult.rowCount === 0) {
            return res.status(400).json({ message: "Invalid or expired token" });
        }

        const { user_id } = tokenResult.rows[0];

        // Update Password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashedPassword, user_id]);

        // Delete used token (and potentially all tokens for this user)
        await pool.query("DELETE FROM password_resets WHERE user_id = $1", [user_id]);

        res.json({ message: "Password reset successfully. You can now login." });

    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
