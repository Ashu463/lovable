import express from 'express'
import cors from 'cors'
import projectRouter from './modules/project';
import runRouter from './modules/run';
import userRouter from './modules/user';
import chatRouter from './modules/chat';
import designRouter from './modules/design';
import { questionRouter } from './modules/question';
import sessionRouter from './modules/sessions';
import { assertAuthConfig } from './modules/middleware';
import { adminDashboardAuth, isAdminDashboardEnabled } from './modules/admin';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { runQueue } from './modules/worker';
import { logger } from './modules/utils';

assertAuthConfig();

const app = express();

// Browsers may only call the API from origins we know about — CORS_ORIGINS is a
// comma-separated allowlist (dev default: the Vite dev server).
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

app.use(cors({
    // Disallowed origins get a normal response without CORS headers (the
    // browser blocks it) rather than a 500 from a thrown error.
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.includes(origin));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
}))
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "1mb" }))
logger.info("Starting server")
app.use("/api/project", projectRouter);
app.use("/api/run", runRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter)
app.use("/api/design", designRouter)
app.use("/api/question", questionRouter)
app.use("/internal/session", sessionRouter)

// The queue dashboard exposes every job's payload (prompts, user ids), so it
// only mounts when credentials are configured, and always behind basic auth.
if (isAdminDashboardEnabled()) {
    const bullBoardAdapter = new ExpressAdapter();
    bullBoardAdapter.setBasePath("/admin/queues");
    createBullBoard({
        queues: [new BullMQAdapter(runQueue)],
        serverAdapter: bullBoardAdapter,
    });
    app.use("/admin/queues", adminDashboardAuth, bullBoardAdapter.getRouter());
} else {
    logger.warn("BullMQ dashboard disabled: set ADMIN_DASHBOARD_USER and ADMIN_DASHBOARD_PASSWORD to enable it");
}

app.listen(3000, () =>{
    logger.info("Server is running on port 3000")
    if (isAdminDashboardEnabled()) {
        logger.info("BullMQ dashboard on http://localhost:3000/admin/queues")
    }
})
