

import express from 'express'
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

const app = express();
app.use(cors())
app.use(express.json({ limit: '50mb' }))
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

console.table(expressListEndpoints(questionRouter));
app.listen(3000, () =>{
    console.log("Server is running on port 3000")
    console.log("BullMQ dashboard on http://localhost:3000/admin/queues")
})