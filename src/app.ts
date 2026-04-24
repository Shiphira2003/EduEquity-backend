// app.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./middleware/errorHandler";
import usersRouter from "./routes/users";
import studentsRouter from "./routes/students";
import registerRouter from "./routes/register";
import applicationsRouter from "./routes/applications";
import authRouter from "./routes/auth.routes";
import adminRouter from "./routes/admin";
import notificationsRouter from "./routes/notifications";
import announcementsRouter from "./routes/announcements";
import assessmentsRouter from "./routes/assessments";
import fundsourcesRouter from "./routes/fundsources";
import rankingRouter from "./routes/ranking";
import publicRouter from "./routes/public";

const app = express();

// ✅ CORS configuration
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174"], // your frontend URLs
    credentials: true,                                       // allow cookies/auth headers
}));

// ✅ Request Logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

app.use(express.json());
app.use(cookieParser());

app.use("/api/users", usersRouter);
app.use("/api/students", studentsRouter);
app.use("/api/register", registerRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/assessments", assessmentsRouter);
app.use("/api/fund-sources", fundsourcesRouter);
app.use("/api/ranking", rankingRouter);
app.use("/api/public", publicRouter);

app.get("/", (req, res) => {
    res.json({ message: "BursarHub API running" });
});

// ✅ Error handler middleware - MUST be last
app.use(errorHandler);

export default app;
