import dotenv from 'dotenv'
dotenv.config()
import type { AgentRequest, LLMResponse, PlannerTodo } from "../types/types";
import { events } from "./events";

import { fetchContext } from './utils/memory';
import { streamLLM } from './llm';
import { Agent } from './agent';


export async function AgentCall(prompt: string, report: (status: string) => void){
    events.emit("whatever the response be", "kitna bhi", "response bhj skte ho")

    /*Steps: 
    - Refactor the prompt: user message + system prompt(could be dynamic) + context(out of available memory and given user query)
    - Decide whether the task is simple or complex
        - if yes, then make todos for that
        - else leave it

    - StreamLLM, and this time both streaming as well as complete onetime response
    - spawn sub agents if needed else main agent is fine
    - execute tool calls via MCP this time, that qna tool
    - let sub agent use some skills
    - then generate the response
    - Push back into memory
    - RAG where? 
    
    - Iterate back to evaluate those responses, 
    */

    const context = fetchContext(prompt)

    
    let response: LLMResponse

    /* Phase-2 

    - Post it to the vercel or netlify, figure that out. 
    - fetch their endpoints and display it to the user. 

    */
   // TODO: implement BAML.
    const taskComplexity: Promise<PlannerTodo[]> = await checkComplexityAndBuildTodo(payload.prompt)
    let spawnSubagent = false;
    if(taskComplexity!.length > 0) spawnSubagent = true;

    let agent: Agent = new Agent("asdf", "asdf")
    agent.execute(prompt)

    if((await taskComplexity!).length > 0){
        // use sub agents way
    }
    else{
        // use simple agent loop
        response = MainAgentLoop({
            model: "deepseek-v4-flash",
            provider: "deepseek",
            key: process.env.DEEPSEEK_API_KEY | "",
            prompt: prompt
        })
    }
    


}
async function MainAgentLoop(payload: AgentRequest){
    /*Steps; 

    - standard agent loop, construct prompt setup the right context -> 
    spawn sub agent (if needed) -> make the LLM call -> execute the 
    tool calls/skills/MCP calls -> store results into session and 
    write LLM responses to the file storage (probably S3 or what) -> loop continues

    - spin a new sandbox, into the agent call itself and let tool call write in that storage
    - expose it's build files and return back as LLMResponse

    */
    

    let hasMoreToolCalls = true;
    let firstTurn = true;
    while(hasMoreToolCalls){
        if(firstTurn){

        }
        else{

        }
        const response: LLMResponse = await streamLLM(payload)

        if(response.toolCalls.length > 0){

        }

    }
    
}

async function checkComplexityAndBuildTodo(user_prompt: string): Promise<PlannerTodo>{
    
    let todos: PlannerTodo[] = []
    try{
        const response = await client.chat.completions.create({
            model: "deepseek-v4-flash",
            messages: [
                {role: "system", content: COMPLEXITY_SYSTEM_PROMPT},
                {role: "user", content: user_prompt}
            ]
        })
        console.log(response.choices[0]?.message.content, " is the todo LLM response")
        todos = response.choices[0]?.message.content // TODO: implement BAML.
    }catch(e){
        throw new Error("Error occurred while checking and generating complexity and todo")
    }

    return todos!.length > 0 ? todos : []
    
}