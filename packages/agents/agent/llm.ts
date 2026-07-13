import type { AgentRequest, PlannerTodo } from "../types/types";
import OpenAI from "openai";
import { COMPLEXITY_SYSTEM_PROMPT } from "./config/sysPrompts";

const client = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: "https://api.deepseek.com"
})

export async function streamLLM(payload: AgentRequest, ){
    
    
}

