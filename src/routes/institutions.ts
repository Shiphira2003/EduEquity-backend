import { Router, Request, Response } from "express";
import { db } from "../db/db";
import { institutionsTable } from "../db/schema";
import { ilike, or } from "drizzle-orm";

const router = Router();

// 0. Hardcoded Popular Institutions Fallback (Guaranteed results even if API fails)
const POPULAR_INSTITUTIONS = [
    { name: "University of Nairobi", category: "University", source: "System Registry" },
    { name: "Kenyatta University", category: "University", source: "System Registry" },
    { name: "Jomo Kenyatta University of Agriculture and Technology", category: "University", source: "System Registry" },
    { name: "Moi University", category: "University", source: "System Registry" },
    { name: "Egerton University", category: "University", source: "System Registry" },
    { name: "Maseno University", category: "University", source: "System Registry" },
    { name: "Technical University of Kenya", category: "University", source: "System Registry" },
    { name: "Technical University of Mombasa", category: "University", source: "System Registry" },
    { name: "Strathmore University", category: "University", source: "System Registry" },
    { name: "Mount Kenya University", category: "University", source: "System Registry" },
    { name: "Masinde Muliro University of Science and Technology", category: "University", source: "System Registry" },
    { name: "Dedan Kimathi University of Technology", category: "University", source: "System Registry" },
    { name: "Murang'a University of Technology", category: "University", source: "System Registry" },
    { name: "Kirinyaga University", category: "University", source: "System Registry" },
    { name: "Laikipia University", category: "University", source: "System Registry" },
    { name: "Chuka University", category: "University", source: "System Registry" },
    { name: "Kisii University", category: "University", source: "System Registry" },
    { name: "Meru University of Science and Technology", category: "University", source: "System Registry" },
    { name: "University of Eldoret", category: "University", source: "System Registry" },
    { name: "Riara University", category: "University", source: "System Registry" },
    { name: "United States International University Africa", category: "University", source: "System Registry" },
    { name: "Daystar University", category: "University", source: "System Registry" },
    { name: "Kenya Medical Training College (KMTC)", category: "TVET", source: "System Registry" },
    { name: "The Nairobi polytechnic", category: "TVET", source: "System Registry" },
    { name: "Kabarak University", category: "University", source: "System Registry" },
    { name: "Zetech University", category: "University", source: "System Registry" },
    { name: "Alliance High School", category: "Secondary", source: "System Registry" },
    { name: "Kenya High School", category: "Secondary", source: "System Registry" },
    { name: "Starehe Boys Centre", category: "Secondary", source: "System Registry" },
    { name: "Mangu High School", category: "Secondary", source: "System Registry" },
    { name: "Loreto High School Limuru", category: "Secondary", source: "System Registry" },
    { name: "Primary School (General)", category: "Primary", source: "System Registry" },
];

/**
 * GET /api/institutions/search
 * Search for institutions from Universities Hippo API (External) 
 * and our local database (Internal).
 */
router.get("/search", async (req: Request, res: Response) => {
    try {
        const query = (req.query.q as string || "").trim().toLowerCase();
        const level = (req.query.level as string || "").toUpperCase();
        
        // 1. Filter from our hardcoded popular list based on level
        let filteredPopular = POPULAR_INSTITUTIONS;
        if (level === "PRIMARY") {
            filteredPopular = POPULAR_INSTITUTIONS.filter(inst => inst.category === "Primary");
        } else if (level === "SECONDARY") {
            filteredPopular = POPULAR_INSTITUTIONS.filter(inst => inst.category === "Secondary");
        } else if (level === "TERTIARY") {
            filteredPopular = POPULAR_INSTITUTIONS.filter(inst => inst.category === "University" || inst.category === "TVET");
        }

        const popularResults = query 
            ? filteredPopular.filter(inst => inst.name.toLowerCase().includes(query))
            : filteredPopular; 

        // 2. Fetch from external API (ONLY for Tertiary)
        let externalInstitutions: any[] = [];
        if (level === "TERTIARY" || !level) {
            try {
                const externalUrl = `https://universities.hipolabs.com/search?country=kenya${query ? `&name=${encodeURIComponent(query)}` : ""}`;
            console.log(`🔍 Fetching: ${externalUrl}`);
            
            const response = await fetch(externalUrl, {
                headers: { 'User-Agent': 'BursarHub-Platform/1.0' },
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (response.ok) {
                const externalData: any[] = await response.json();
                externalInstitutions = (Array.isArray(externalData) ? externalData : [])
                    .filter((inst: any) => inst && inst.name)
                    .map((inst: any) => ({
                        name: inst.name,
                        source: 'Global Directory',
                        category: 'University'
                    }));
            }
        } catch (apiErr) {
            console.error("External API unreachable, using fallbacks only.");
        }
    }

        // 3. Fetch from local database (Manual entries)
        let localMapped: any[] = [];
        try {
            const localInstitutions = await db.select({
                name: institutionsTable.name,
                category: institutionsTable.category
            })
            .from(institutionsTable)
            .where(query ? ilike(institutionsTable.name, `%${query}%`) : undefined)
            .limit(20);

            localMapped = localInstitutions
                .filter(inst => inst && inst.name)
                .map(inst => ({
                    name: inst.name,
                    source: 'System Registry',
                    category: inst.category
                }));
        } catch (dbErr) {
            console.error("DB error fetching institutions:", dbErr);
        }

        // 4. Merge all and remove duplicates by name
        const combined = [...popularResults, ...localMapped, ...externalInstitutions];
        const uniqueMap = new Map();
        
        combined.forEach(item => {
            const key = item.name.toLowerCase().trim();
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
            }
        });

        const data = Array.from(uniqueMap.values());

        res.json({
            success: true,
            count: data.length,
            data: data
        });
    } catch (err: any) {
        console.error("Institution search total failure:", err);
        res.status(500).json({ error: "Failed to fetch institutions", details: err.message });
    }
});

export default router;
