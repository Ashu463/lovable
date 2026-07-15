import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import cors from 'cors'
import projectRouter from '../modules/project';
import runRouter from '../modules/run';
import userRouter from '../modules/user';

const app = express();
app.use(cors())
app.use(express.json())

app.use("/projects", projectRouter);
app.use("/runs", runRouter);
app.use("/users", userRouter);

app.listen(3000)