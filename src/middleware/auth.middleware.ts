import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { db } from "../db/db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
    user?: {
        userId: number;
        role: string;
    };
}

export const authMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = verifyToken(token) as any;
        
        // Real-time check if user is still active
        const userRes = await db.select({ isActive: usersTable.isActive })
            .from(usersTable)
            .where(eq(usersTable.id, decoded.userId));

        if (userRes.length === 0 || !userRes[0].isActive) {
            return res.status(403).json({ message: "Your account has been deactivated or discontinued. Please contact support." });
        }

        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
