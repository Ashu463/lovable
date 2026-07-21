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
console.table(expressListEndpoints(questionRouter));
app.listen(3000, () =>{
    console.log("Server is running on port 3000")
})