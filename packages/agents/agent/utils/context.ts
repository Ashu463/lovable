import { b, type EpisodicMemory } from "../../baml_client"
import { COMPRESS_EPISODIC_MEM_PROMPT, EPISODIC_MEMORY_GENERATOR_PROMPT } from "../config/sysPrompts"

export class Context{
    constructor(
        public systemPrompt: string, 
        public orgTask: string, 
        public semanticMem: string, // the memory which tells about general user behaviour
        // public episodicSummary: string, // compressed version of this episodicMemory
    ){}

    // would almost take 24K tokens
    async WorkingMemory(recentHistory: string, session: string[], currToolResult?: string): Promise<string>{

        const episodicMemory: EpisodicMemory = await this.CompleteEpisodicSummary(session)
        const SummarizedEpisodicMem: string = await this.SummarizedEpisodicMem(episodicMemory)
        return (
            this.systemPrompt + 
            this.orgTask + 
            this.semanticMem + 
            SummarizedEpisodicMem + 
            recentHistory + 
            currToolResult
        )
    }

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

    async BuildContext(recentHistory: string, session: string[], currToolResult?: string, ): Promise<string>{

        // working memory
        const WorkingMemory: string = await this.WorkingMemory(recentHistory, session, currToolResult)

        // episodic memory 
        
        // semantic one from mem0 itself.
    }
}