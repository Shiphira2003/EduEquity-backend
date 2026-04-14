import { Router } from "express";
import rateLimit from "express-rate-limit";
import { login, forgotPassword, resetPassword, signup, refresh, logout, verifyOTP, resendOTP } from "../controllers/auth.controller";

const router = Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Increased for dev
    message: { message: "Too many authentication attempts, please try again after 15 minutes" },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post("/signup", authLimiter, signup);         // Public — first user = ADMIN, rest = STUDENT
router.post("/verify-email", authLimiter, verifyOTP);
router.post("/resend-otp", authLimiter, resendOTP);
router.post("/login", authLimiter, login);
router.get("/refresh", refresh);
router.post("/logout", logout);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password", authLimiter, resetPassword);

export default router;
