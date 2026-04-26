import { Router, Request, Response } from "express";

const router = Router();

// A comprehensive list of common courses in Kenyan Universities and Colleges
const COMMON_COURSES = [
    // Computing & IT
    { name: "Bachelor of Science in Computer Science", category: "Computing" },
    { name: "Bachelor of Science in Information Technology", category: "Computing" },
    { name: "Bachelor of Science in Software Engineering", category: "Computing" },
    { name: "Bachelor of Science in Data Science", category: "Computing" },
    { name: "Bachelor of Science in Cybersecurity", category: "Computing" },
    { name: "Diploma in Information Technology", category: "Computing" },
    { name: "Diploma in Computer Science", category: "Computing" },
    { name: "Certificate in Information Technology", category: "Computing" },

    // Business & Economics
    { name: "Bachelor of Commerce (BCom)", category: "Business" },
    { name: "Bachelor of Business Information Technology (BBIT)", category: "Business" },
    { name: "Bachelor of Science in Economics", category: "Business" },
    { name: "Bachelor of Arts in Economics and Statistics", category: "Business" },
    { name: "Bachelor of Science in Finance", category: "Business" },
    { name: "Bachelor of Science in Accounting", category: "Business" },
    { name: "Bachelor of Human Resource Management", category: "Business" },
    { name: "Bachelor of Science in Supply Chain Management", category: "Business" },
    { name: "Diploma in Business Management", category: "Business" },

    // Medicine & Health Sciences
    { name: "Bachelor of Medicine and Bachelor of Surgery (MBChB)", category: "Medicine" },
    { name: "Bachelor of Pharmacy", category: "Medicine" },
    { name: "Bachelor of Science in Nursing", category: "Medicine" },
    { name: "Bachelor of Science in Clinical Medicine", category: "Medicine" },
    { name: "Bachelor of Dental Surgery", category: "Medicine" },
    { name: "Bachelor of Science in Public Health", category: "Medicine" },
    { name: "Bachelor of Science in Medical Laboratory Science", category: "Medicine" },
    { name: "Diploma in Nursing", category: "Medicine" },
    { name: "Diploma in Clinical Medicine", category: "Medicine" },
    { name: "Diploma in Pharmacy", category: "Medicine" },

    // Engineering & Technology
    { name: "Bachelor of Science in Civil Engineering", category: "Engineering" },
    { name: "Bachelor of Science in Electrical and Electronic Engineering", category: "Engineering" },
    { name: "Bachelor of Science in Mechanical Engineering", category: "Engineering" },
    { name: "Bachelor of Science in Mechatronic Engineering", category: "Engineering" },
    { name: "Bachelor of Science in Geospatial Engineering", category: "Engineering" },
    { name: "Diploma in Civil Engineering", category: "Engineering" },
    { name: "Diploma in Electrical Engineering", category: "Engineering" },

    // Education
    { name: "Bachelor of Education (Arts)", category: "Education" },
    { name: "Bachelor of Education (Science)", category: "Education" },
    { name: "Bachelor of Education (Special Needs)", category: "Education" },
    { name: "Bachelor of Education (Early Childhood)", category: "Education" },
    { name: "Diploma in Education (Arts)", category: "Education" },

    // Law & Social Sciences
    { name: "Bachelor of Laws (LLB)", category: "Law" },
    { name: "Bachelor of Arts in Criminology", category: "Social Sciences" },
    { name: "Bachelor of Arts in Political Science", category: "Social Sciences" },
    { name: "Bachelor of Arts in Sociology", category: "Social Sciences" },
    { name: "Bachelor of Arts in Psychology", category: "Social Sciences" },
    { name: "Bachelor of Arts in International Relations", category: "Social Sciences" },
    { name: "Diploma in Law", category: "Law" },

    // Agriculture & Environment
    { name: "Bachelor of Science in Agriculture", category: "Agriculture" },
    { name: "Bachelor of Science in Agricultural Economics", category: "Agriculture" },
    { name: "Bachelor of Science in Environmental Science", category: "Environment" },
    { name: "Bachelor of Science in Horticulture", category: "Agriculture" }
];

/**
 * GET /api/courses/search
 * Returns a list of courses matching a query.
 */
router.get("/search", (req: Request, res: Response) => {
    try {
        const query = (req.query.q as string || "").toLowerCase();
        
        let filtered = COMMON_COURSES;
        if (query) {
            filtered = COMMON_COURSES.filter(c => 
                c.name.toLowerCase().includes(query) || 
                c.category.toLowerCase().includes(query)
            );
        }

        res.json({
            success: true,
            count: filtered.length,
            data: filtered
        });
    } catch (err: any) {
        res.status(500).json({ error: "Failed to fetch courses" });
    }
});

export default router;
