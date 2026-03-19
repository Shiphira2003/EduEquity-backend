// app.ts
import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/errorHandler";
import usersRouter from "./routes/users";
import studentsRouter from "./routes/students";
import registerRouter from "./routes/register";
import applicationsRouter from "./routes/applications";
import authRouter from "./routes/auth.routes";
import adminRouter from "./routes/admin";
import notificationsRouter from "./routes/notifications";
import announcementsRouter from "./routes/announcements";

const app = express();

// ✅ CORS configuration
app.use(cors({
    origin: "http://localhost:5173", // your frontend URL
    credentials: true,               // allow cookies/auth headers
}));

app.use(express.json());

app.use("/api/users", usersRouter);
app.use("/api/students", studentsRouter);
app.use("/api/register", registerRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/announcements", announcementsRouter);

app.get("/", (req, res) => {
    res.json({ message: "EduEquity API running" });
});

// ✅ Error handler middleware - MUST be last
app.use(errorHandler);

export default app;
