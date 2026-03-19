import { Router } from "express";
import { login, forgotPassword, resetPassword, signup } from "../controllers/auth.controller";

const router = Router();

router.post("/signup", signup);         // Public — first user = ADMIN, rest = STUDENT
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;
