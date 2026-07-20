import dotenv from 'dotenv'
dotenv.config()
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

app.use("/projects", projectRouter);
app.use("/runs", runRouter);
app.use("/users", userRouter);
app.use("/chat", chatRouter)
app.use("/design", designRouter)
app.use("/question", questionRouter)
app.use("/sessions", sessionRouter)
app.listen(3000, () =>{
    console.log("Server is running on port 3000")
})