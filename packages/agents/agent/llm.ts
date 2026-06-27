import type { AgentRequest, Todo } from "../types";
import OpenAI from "openai";
import { COMPLEXITY_SYSTEM_PROMPT } from "./config";

const client = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: "https://api.deepseek.com"
})

export async function streamLLM(payload: AgentRequest, ){
    
    
}

