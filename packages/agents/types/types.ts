import type { Screen } from "@google/stitch-sdk";

export interface AgentRequest{
    // chatId: string,
    // userId: string, 
    provider: string,
    model: string
    key: string
    prompt: string
}
export interface Todo{

}
export enum AgentRole {
    Research, 
    Coding,
    Debugging,
    Documentation,
    Summarize,
    CompactContext,
    Designing
}
export interface Task{
    description: string
    
}
export enum SubAgentStatus {
    Idle,
    Running,
    Waiting,
    Completed,
    Failed
}
export interface AgentResult {
    summary: string;
    artifacts: string[];
    confidence: number;
}
export interface Tool{
    
}
// export interface LLMResponse{
//     stopReason: string
//     output: string
//     toolCalls: ToolCall[]
// }
// export interface ToolCall{
//     name: string
//     input: Record<string, unknown>
// }
export interface LLMResponse{
    
}

export interface BootstrapResponse{
    userPrompt: string, 
    isComplex: boolean,
    design: Screen
}
export interface Answers{
    question: string, 
    answer: string
}