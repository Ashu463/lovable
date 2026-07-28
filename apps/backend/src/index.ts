import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import projectRouter from './modules/project';
import runRouter from './modules/run';
import userRouter from './modules/user';
import chatRouter from './modules/chat';
import designRouter from './modules/design';
import { questionRouter } from './modules/question';
import sessionRouter from './modules/sessions';
import expressListEndpoints from "express-list-endpoints";
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { runQueue } from './modules/worker';
import { logger } from './modules/utils';

const app = express();
app.use(cors())
app.use(express.json())
console.log("Starting server")
app.use("/api/project", projectRouter);
app.use("/api/run", runRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter)
app.use("/api/design", designRouter)
app.use("/api/question", questionRouter)
app.use("/internal/session", sessionRouter)

const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath("/admin/queues");
createBullBoard({
    queues: [new BullMQAdapter(runQueue)],
    serverAdapter: bullBoardAdapter,
});
app.use("/admin/queues", bullBoardAdapter.getRouter());

// Express 5 forwards rejected async handlers here; without this they'd be
// answered by the default handler, which logs nothing and can leak stacks.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    logger.error(`Unhandled error on ${req.method} ${req.originalUrl}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    if (res.headersSent) {
        return next(err);
    }
    return res.status(500).json({ success: false, message: "Internal server error" });
});

process.on("unhandledRejection", (reason) => {
    logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`);
});
process.on("uncaughtException", (err) => {
    logger.error(`Uncaught exception: ${err.stack ?? err.message}`);
});

console.table(expressListEndpoints(questionRouter));
app.listen(3000, () =>{
    console.log("Server is running on port 3000")
    console.log("BullMQ dashboard on http://localhost:3000/admin/queues")
})