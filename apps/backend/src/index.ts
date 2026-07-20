import express from 'express'
import cors from 'cors'
import projectRouter from './modules/project';
import runRouter from './modules/run';
import userRouter from './modules/user';
import chatRouter from './modules/chat';
import designRouter from './modules/design';
import { questionRouter } from './modules/question';
import sessionRouter from './modules/sessions';

const app = express();
app.use(cors())
app.use(express.json())
console.log("Starting server")
app.use("/api/projects", projectRouter);
app.use("/api/runs", runRouter);
app.use("/api/users", userRouter);
app.use("/api/chat", chatRouter)
app.use("/api/design", designRouter)
app.use("/api/question", questionRouter)
app.use("/internal/sessions", sessionRouter)
app.listen(3000, () =>{
    console.log("Server is running on port 3000")
})