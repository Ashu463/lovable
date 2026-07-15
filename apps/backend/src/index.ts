import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import cors from 'cors'
import { randomUUIDv7 } from 'bun';
import { AgentCall, events, type AgentRequest } from '../../../packages/agents';

const app = express();
app.use(cors())
app.use(express.json())
/*
TODOs: 
- auth, do at very last
- chat/new
- chat/:id

Design: 
- General: 
    - Auth routes: 
        - /login, /logout
        - /login with google
    - User profile storing
        - /user/:userId
    - Projects: 
        - /projects/:projectId
        - /project/listAll 

- Agent specific
    - POST: /chat/:userId/:projectId which will essentially call the orchestrator and trigger whole agent pipeline.

- DB ops specific
    - GET: /db/getQuestions
    - GET: /db/getDesigns
    - GET: /db/getSelectedDesign
    - GET: /db/fetchPriorDesigns
    - GET: /db/user/:userId
    - GET: /db/getProjects/:userId/:projectId
    - POST: /internal/sessions/:projectId/events
    - POST: /internal/sessions/:projectId/state
    - GET: /db/fetchSummaries ~ for all task summaries
*/
app.post('/chat/:id', (req, res) =>{
    res.setHeader("content-type", "text/event-stream")
    res.setHeader("cache-control", "no-cache")
    res.setHeader("Connection", "keep-alive")

    let id: string = req?.params.id
    let userId: string = req.body?.userId
    const prompt: string = req.body.prompt
    if(!id){
        id = randomUUIDv7()
    }
    if(!userId){
        userId = randomUUIDv7()
    }

    events.on("status", (message: string) =>{
        console.log(message)
    })

    const report = (status: string) => {
        console.log(status);               // Backend logs it
        res.write(`data: ${status}\n\n`);  // Stream it to the client
    };

    /*steps: 
    1. call agent
        - agent will do the task 
        - spin up the sandbox
        - returns you the complete code
        - snapshot of sandbox sended to the file storage to maintain the session before sandbox dies
        - you run it's build over vercel or netlify, check it status and inform agent about it. 

    2. store the session in DB.

    3. If sandbox died and user calls the query then you let the sandbox use old build code rather than
        giving LLM a fresh call. 



    */

    // AgentCall(id, prompt, report)

    /* Key thing when LLM have some pending work but crosses the context window.
    let cancelled = false;

    req.on("close", () => {
        cancelled = true;
    });

    and then if (isCancelled()) {return;} into agent loop
    */
    req.on("close", () =>{
        events.off("status", (message: string) => {
            console.log(message)
        })
    })

    res.end()

})

app.use("/projects", projectRouter);
app.use("/runs", runRouter);
app.use("/users", userRouter);

app.listen(3000)