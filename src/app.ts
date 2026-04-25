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
import communityRouter from "./routes/community";
import { paymentRouter } from "./routes/payments/payments.routes";

const app = express();

// Webhooks MUST run before express.json() is universally parsed.
// In payments.routes.ts, /webhook already has express.raw injected if mounted correctly,
// but usually it's cleaner to mount the raw route before express.json() globally.
// However, since we placed express.raw as a middleware inside the router,
// we just need to use the router *before* express.json() if it overlaps, OR
// exclude /api/payments/webhook from express.json().

// Better: Webhook specifically bypassed:
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// ✅ CORS configuration
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
}));

app.use((req, res, next) => {
    if (req.originalUrl === '/api/payments/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});

app.use(cookieParser());

// ✅ Request Logger
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
});

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
app.use("/api/community", communityRouter);
app.use("/api/payments", paymentRouter);

app.get("/", (req, res) => {
    res.json({ message: "BursarHub API running" });
});

// ✅ Error handler middleware - MUST be last
app.use(errorHandler);

export default app;
