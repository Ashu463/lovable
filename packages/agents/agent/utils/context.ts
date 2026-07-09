import { b, type EpisodicMemory } from "../../baml_client"
import type { ContextStruct } from "../../types/mainAgentTypes"
import { COMPACT_CONTEXT_PROMPT, COMPRESS_EPISODIC_MEM_PROMPT, EPISODIC_MEMORY_GENERATOR_PROMPT, SUMMARIZE_CONTEXT_PROMPT } from "../config/sysPrompts"
import { encoding_for_model } from "tiktoken"
import { type Message } from "../../baml_client"
import { COMPACT_THRESHOLD, MAX_CONTEXT_WINDOW_LENGTH } from "../config/systemConfig"

export class ContextManager{

    constructor(
        public systemPrompt: string, 
        public originalTask: string, 
        public semanticMem: string, // the memory which tells about general user behaviour
        // public episodicSummary: string, // compressed version of this episodicMemory
    ){}

    // almost 100k tokens
    async CompleteEpisodicSummary(session: string[]): Promise<EpisodicMemory>{
        let epiSumm: EpisodicMemory
        try{
            epiSumm = await b.CompressContext(EPISODIC_MEMORY_GENERATOR_PROMPT, session)
        }
        catch(e){
            console.error(e)
            throw e
        }
        return epiSumm
    }

    async SummarizedEpisodicMem(episodicMemory: EpisodicMemory): Promise<string>{
        let summary: string
        try{
            summary = await b.SummarizeEpisodic(COMPRESS_EPISODIC_MEM_PROMPT, episodicMemory)
        }
        catch(e){
            console.error(e)
            throw e
        }
        return summary
    }

    // would almost take 24K tokens
    async WorkingMemory(recentHistory: string, summarizedEpisodic: string, currToolResult?: string): Promise<string>{

        return (
            this.systemPrompt + 
            this.originalTask + 
            this.semanticMem + 
            summarizedEpisodic + 
            recentHistory + 
            currToolResult
        )
    }

    async BuildContext(recentHistory: string, session: string[], currToolResult?: string, ): Promise<string>{

        // episodic memory
        let episodicMemory: EpisodicMemory = await this.CompleteEpisodicSummary(session)
        const SummarizedEpisodicMem: string = await this.SummarizedEpisodicMem(episodicMemory)

        // working memory
        const WorkingMemory: string = await this.WorkingMemory(recentHistory, SummarizedEpisodicMem, currToolResult)

        // semantic one from mem0 itself.
        const semanticMem: string = mem0.retrieve(`${currToolResult + recentHistory}`)
        return (WorkingMemory + JSON.stringify(episodicMemory) + semanticMem)
    }

    estimateTokens(context: Message[]): number {
        const encoder = encoding_for_model("gpt-4o")
        return encoder.encode(context.map(m => m.content).join('')).length
    }
    // Context Reduction
    async CompactContext(context: Message[]): Promise<Message[]>{
        // compact 50% of the starting context, not the latest one until it gets 
        // within the limits. very smart thing it is.
        const mid = Math.floor(context.length/2)
        const olderHalf = context.slice(0, mid)
        const recentHalf = context.slice(mid, context.length)

        const olderCompacted = await b.CompactContext(COMPACT_CONTEXT_PROMPT, olderHalf)

        return [...olderCompacted, ...recentHalf]
        const encoder = encoding_for_model("gpt-4")
        const len = context.length
        let firstHalf: Message[] = []
        let secondHalf: Message[] = []
        let it = 0;
        for(const msg of context){
            if(it < len/2) firstHalf.push(msg)
            else secondHalf.push(msg)
        }
        let firstHalfCompacted: Message[]
        try{
            firstHalfCompacted = 
        }
        catch(e){
            console.error(e)
            throw e
        }
        let secondHalfCompacted: Message[]
        const firstHalfMsgs = firstHalfCompacted.map((msg) => msg.content).join(" ")
        if(encoder.encode(firstHalfMsgs).length > COMPACT_THRESHOLD){
            try{
                secondHalfCompacted = await b.CompactContext(COMPACT_CONTEXT_PROMPT, secondHalf)
            }
            catch(e){
                console.error(e)
                throw e
            }
        }
        else{
            return firstHalfCompacted
        }
        const compactedContext: Message[] = [...firstHalfCompacted, ...secondHalfCompacted]

        return compactedContext
    }
    async SummarizeContext(context: Message[]): Promise<Message[]>{
        // note that we'll be using complete original context array not the compacted one.
        return await b.SummarizeContext(SUMMARIZE_CONTEXT_PROMPT, context)
    }
    async IsolateContext(): Promise<string> {

    }
    // only for MCP or RAG 
    async OffLoadContext(): Promise<string>{

    }
}