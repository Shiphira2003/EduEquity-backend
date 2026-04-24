import { db } from "../src/db/db";
import { fundSourcesTable } from "../src/db/schema";
import { and, eq } from "drizzle-orm";

async function setup() {
    console.log("🚀 Starting Fund Source Setup...");
    
    const cycleYear = 2026;
    const sources = [
        { name: "MCA", budget: "5000000", description: "Mobilization on Contentious Areas Fund" },
        { name: "CDF", budget: "3000000", description: "Constituency Development Fund" },
        { name: "COUNTY", budget: "4000000", description: "County Education Oversight Fund" },
        { name: "NATIONAL", budget: "8000000", description: "National Presidential Bursary Scheme" },
    ];

    for (const source of sources) {
        // Check if exists
        const existing = await db.select()
            .from(fundSourcesTable)
            .where(and(
                eq(fundSourcesTable.name, source.name as any),
                eq(fundSourcesTable.cycleYear, cycleYear)
            ));

        if (existing.length > 0) {
            console.log(`🟡 Updating ${source.name} for ${cycleYear}...`);
            await db.update(fundSourcesTable)
                .set({
                    isOpen: true,
                    budgetPerCycle: source.budget,
                    updatedAt: new Date()
                })
                .where(eq(fundSourcesTable.id, existing[0].id));
        } else {
            console.log(`🟢 Creating ${source.name} for ${cycleYear}...`);
            await db.insert(fundSourcesTable).values({
                name: source.name as any,
                budgetPerCycle: source.budget,
                cycleYear: cycleYear,
                description: source.description,
                isOpen: true,
                allocatedAmount: "0",
                disbursedAmount: "0"
            });
        }
    }

    console.log("✅ Fund Source Setup Complete and all sources are OPEN.");
    process.exit(0);
}

setup().catch(err => {
    console.error("❌ Setup failed:", err);
    process.exit(1);
});
