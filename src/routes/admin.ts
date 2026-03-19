import { Router, Request, Response, NextFunction } from "express";
import pool from "../db/db";
import { upload } from "../middleware/upload";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";
import { roleMiddleware } from "../middleware/role.middleware";

const router = Router();

// Apply auth and admin role to all routes in this file
router.use(authMiddleware, roleMiddleware("admin"));

// 1. GET /api/admin/profile
router.get("/profile", async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const result = await pool.query(
            `SELECT a.*, u.email 
             FROM admins a 
             JOIN users u ON a.user_id = u.id 
             WHERE u.id = $1`,
            [userId]
        );

        if (result.rowCount === 0) {
            const userResult = await pool.query("SELECT email FROM users WHERE id = $1", [userId]);
            return res.json({ email: userResult.rows[0].email });
        }
        res.json(result.rows[0]);
    } catch (err) {
        next(err);
    }
});

// 2. PUT /api/admin/profile
router.put("/profile", upload.single("image_icon"), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user!.userId;
        const { full_name, id_number } = req.body;
        const file = req.file;

        const existing = await pool.query("SELECT * FROM admins WHERE user_id = $1", [userId]);

        let imageUrl = existing.rows[0]?.image_icon || null;
        if (file) {
            imageUrl = file.path; // Multer saves local path or Cloudinary URL
        }

        if (existing.rowCount === 0) {
            if (!full_name) {
                return res.status(400).json({ error: "full_name is required for new admin profile" });
            }
            const inserted = await pool.query(
                `INSERT INTO admins (user_id, full_name, id_number, image_icon)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [userId, full_name, id_number, imageUrl]
            );
            return res.json(inserted.rows[0]);
        } else {
            const updated = await pool.query(
                `UPDATE admins 
                 SET full_name = COALESCE($1, full_name),
                     id_number = COALESCE($2, id_number),
                     image_icon = COALESCE($3, image_icon)
                 WHERE user_id = $4
                 RETURNING *`,
                [full_name, id_number, imageUrl, userId]
            );
            return res.json(updated.rows[0]);
        }
    } catch (err) {
        next(err);
    }
});

// 3. GET /api/admin/analytics
router.get("/analytics", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const studentsCount = await pool.query("SELECT COUNT(*) FROM students");
        const applicationsCount = await pool.query("SELECT COUNT(*) FROM applications");
        const pendingApplicationsCount = await pool.query("SELECT COUNT(*) FROM applications WHERE status = 'PENDING'");
        const disbursementsResult = await pool.query("SELECT SUM(amount_allocated) as total_disbursed FROM applications WHERE status = 'APPROVED'");
        const auditLogsCount = await pool.query("SELECT COUNT(*) FROM audit_logs");

        res.json({
            total_students: parseInt(studentsCount.rows[0].count),
            total_applications: parseInt(applicationsCount.rows[0].count),
            pending_applications: parseInt(pendingApplicationsCount.rows[0].count),
            total_disbursed: parseFloat(disbursementsResult.rows[0].total_disbursed || '0'),
            total_audit_logs: parseInt(auditLogsCount.rows[0].count)
        });
    } catch (err) {
        next(err);
    }
});

// 4. GET /api/admin/students
router.get("/students", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await pool.query(
            `SELECT s.*, u.email 
             FROM students s 
             JOIN users u ON s.user_id = u.id
             ORDER BY s.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// 5. GET /api/admin/audit-logs
router.get("/audit-logs", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const logs = await pool.query(
            `SELECT al.*, u.email as admin_email, a.student_id
             FROM audit_logs al
             LEFT JOIN users u ON al.user_id = u.id
             LEFT JOIN applications a ON al.application_id = a.id
             ORDER BY al.created_at DESC`
        );
        res.json(logs.rows);
    } catch (err) {
        next(err);
    }
});

// 6. GET /api/admin/disbursements
router.get("/disbursements", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await pool.query(
            `SELECT d.*, a.student_id, s.full_name as student_name
             FROM disbursements d
             JOIN applications a ON d.allocation_id = a.id
             JOIN students s ON a.student_id = s.id
             ORDER BY d.created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});

// --- Users Management ---
router.get("/users", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await pool.query(
            `SELECT id, email, role, created_at 
             FROM users 
             ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        next(err);
    }
});


// --- CRUD: Students ---

// PUT /api/admin/students/:id
router.put("/students/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { full_name, institution, course, year_of_study, national_id } = req.body;

        const updated = await pool.query(
            `UPDATE students 
             SET full_name = COALESCE($1, full_name),
                 institution = COALESCE($2, institution),
                 course = COALESCE($3, course),
                 year_of_study = COALESCE($4, year_of_study),
                 national_id = COALESCE($5, national_id)
             WHERE id = $6 RETURNING *`,
            [full_name, institution, course, year_of_study, national_id, id]
        );

        if (updated.rowCount === 0) return res.status(404).json({ error: "Student not found" });
        res.json(updated.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/students/:id
router.delete("/students/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;

        const student = await pool.query("SELECT user_id FROM students WHERE id = $1", [id]);
        if (student.rowCount === 0) return res.status(404).json({ error: "Student not found" });

        const userId = student.rows[0].user_id;

        // Delete from students
        await pool.query("DELETE FROM students WHERE id = $1", [id]);

        // Delete from users (cascade deletes might exist, but doing it explicitly guarantees)
        await pool.query("DELETE FROM users WHERE id = $1", [userId]);

        res.json({ success: true, message: "Student and user account deleted" });
    } catch (err) {
        next(err);
    }
});

// --- CRUD: Applications ---

// POST /api/admin/applications
router.post("/applications", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { student_id, cycle_year, amount_requested } = req.body;

        const inserted = await pool.query(
            `INSERT INTO applications (student_id, cycle_year, amount_requested, document_url)
             VALUES ($1, $2, $3, '[]') RETURNING *`,
            [student_id, cycle_year, amount_requested]
        );
        res.status(201).json(inserted.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/applications/:id
router.put("/applications/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { amount_requested, cycle_year } = req.body;

        const updated = await pool.query(
            `UPDATE applications 
             SET amount_requested = COALESCE($1, amount_requested),
                 cycle_year = COALESCE($2, cycle_year)
             WHERE id = $3 RETURNING *`,
            [amount_requested, cycle_year, id]
        );

        if (updated.rowCount === 0) return res.status(404).json({ error: "Application not found" });
        res.json(updated.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/applications/:id
router.delete("/applications/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM applications WHERE id = $1 RETURNING *", [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: "Application not found" });
        res.json({ success: true, message: "Application deleted" });
    } catch (err) {
        next(err);
    }
});


// --- CRUD: Disbursements ---

// POST /api/admin/disbursements
router.post("/disbursements", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { allocation_id, amount, status } = req.body;

        const inserted = await pool.query(
            `INSERT INTO disbursements (allocation_id, amount, status)
             VALUES ($1, $2, $3) RETURNING *`,
            [allocation_id, amount, status || 'PENDING']
        );
        res.status(201).json(inserted.rows[0]);
    } catch (err) {
        next(err);
    }
});

// PUT /api/admin/disbursements/:id
router.put("/disbursements/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const { amount, status } = req.body;

        const updated = await pool.query(
            `UPDATE disbursements 
             SET amount = COALESCE($1, amount),
                 status = COALESCE($2, status)
             WHERE id = $3 RETURNING *`,
            [amount, status, id]
        );

        if (updated.rowCount === 0) return res.status(404).json({ error: "Disbursement not found" });
        res.json(updated.rows[0]);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/disbursements/:id
router.delete("/disbursements/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM disbursements WHERE id = $1 RETURNING *", [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: "Disbursement not found" });
        res.json({ success: true, message: "Disbursement deleted" });
    } catch (err) {
        next(err);
    }
});

export default router;
