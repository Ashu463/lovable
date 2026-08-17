import { b, type CoderContext, type DebuggerContext, type EpisodicMemory, type ResearcherContext, type Skill, type SubAgentsContext } from "../../baml_client"
// import type { ContextStruct } from "../../types/agentTypes"
import { COMPACT_CONTEXT_PROMPT, COMPRESS_EPISODIC_MEM_PROMPT, EPISODIC_MEMORY_GENERATOR_PROMPT, SUMMARIZE_CONTEXT_PROMPT } from "../config/systemPrompts"
import { encoding_for_model } from "tiktoken"
import { type Message } from "../../baml_client"
import { RECENT_TURNS_LIMIT, COMPACT_THRESHOLD, MAX_CONTEXT_WINDOW_LENGTH, TOOL_RESULT_MAX_CHARS, READ_RESULT_MAX_CHARS } from "../config/systemConfig"

function truncate(text: string, limit: number): string {
    if (text.length <= limit) return text
    const half = Math.floor(limit / 2)
    return `${text.slice(0, half)}\n... [${text.length - limit} chars omitted — this excerpt is all you get; use RunCommand with sed/grep to see a specific range] ...\n${text.slice(-half)}`
}

function rawResultText(toolRes: any): string {
    if (typeof toolRes?.response === 'string') return toolRes.response
    if (typeof toolRes?.editedFiles === 'string') return toolRes.editedFiles
    if (typeof toolRes?.toolResult === 'string') return toolRes.toolResult
    return JSON.stringify(toolRes)
}

function extractResultText(res: any, toolRes: any): string {
    return truncate(rawResultText(toolRes), res?.action === 'read' ? READ_RESULT_MAX_CHARS : TOOL_RESULT_MAX_CHARS)
}

// Drops a cached `read` of this path whenever it's about to go stale: either a
// fresh read of the same path is landing right after (old copy redundant), or a
// write/edit/delete just changed what's on disk (old copy now wrong). Without the
// write/edit/delete cases, a coder that edits without re-reading keeps building its
// next oldString off content that no longer exists on disk.
function dropStaleReads(turns: Message[], res: any): Message[] {
    if (!res?.path) return turns
    const invalidatesCachedRead = res.action === 'read' || res.action === 'writeFile' || res.action === 'editFile' || res.action === 'delete'
    if (!invalidatesCachedRead) return turns
    return turns.filter(t => !t.content.startsWith(`read ${res.path} -> `))
}

function applySkillLoad(skills: Skill[], res: any, toolRes: any): Skill[] {
    const content = rawResultText(toolRes)
    return skills.map(s => s.name === res?.skillName ? { ...s, content } : s)
}

function summarizeTurn(res: any, toolRes: any): Message {
    const label = res?.path ?? res?.command ?? res?.skillName ?? ''

    const result = res?.action === 'getSkill'
        ? `loaded into skills (${rawResultText(toolRes).length} chars)`
        : extractResultText(res, toolRes)
    return {
        role: 'toolCall',
        content: `${res?.action ?? 'unknown'}${label ? ` ${label}` : ''} -> ${result}`,
        timestamp: new Date().toISOString()
    }
}

export abstract class ContextManager<TContext>{

    constructor(){}

    // almost 100k tokens
    // async CompleteEpisodicSummary(session: string[]): Promise<EpisodicMemory>{
    //     let epiSumm: EpisodicMemory
    //     try{
    //         epiSumm = await b.CompressContext(EPISODIC_MEMORY_GENERATOR_PROMPT, session)
    //     }
    //     catch(e){
    //         console.error(e)
    //         throw e
    //     }
    //     return epiSumm
    // }

    // async SummarizedEpisodicMem(episodicMemory: EpisodicMemory): Promise<string>{
    //     let summary: string
    //     try{
    //         summary = await b.SummarizeEpisodic(COMPRESS_EPISODIC_MEM_PROMPT, episodicMemory)
    //     }
    //     catch(e){
    //         console.error(e)
    //         throw e
    //     }
    //     return summary
    // }

    // // would almost take 24K tokens
    // async WorkingMemory(recentHistory: string, summarizedEpisodic: string, currToolResult?: string): Promise<string>{

    //     return (
    //         this.systemPrompt + 
    //         this.originalTask + 
    //         this.semanticMem + 
    //         summarizedEpisodic + 
    //         recentHistory + 
    //         currToolResult
    //     )
    // }

    // async BuildContext(recentHistory: string, session: string[], currToolResult?: string, ): Promise<string>{

    //     // episodic memory
    //     let episodicMemory: EpisodicMemory = await this.CompleteEpisodicSummary(session)
    //     const SummarizedEpisodicMem: string = await this.SummarizedEpisodicMem(episodicMemory)

    //     // working memory
    //     const WorkingMemory: string = await this.WorkingMemory(recentHistory, SummarizedEpisodicMem, currToolResult)

    //     // semantic one from mem0 itself.
    //     const semanticMem: string = mem0.retrieve(`${currToolResult + recentHistory}`)
    //     return (WorkingMemory + JSON.stringify(episodicMemory) + semanticMem)
    
    // estimateTokens(context: Message[]): number {
    //     const encoder = encoding_for_model("gpt-4o")
    //     return encoder.encode(context.map(m => m.content).join('')).length
    // }
    // }

    // Context Reduction
    abstract CompactContext(context: TContext): Promise<TContext>
        // compact 50% of the starting context, not the latest one until it gets 
        // within the limits. very smart thing it is.
        
    
    abstract SummarizeContext(context: TContext): Promise<TContext>
        // note that we'll be using complete original context array not the compacted one.
    
    // TODO: do this 
    abstract IsolateContext(): Promise<string>
    // only for MCP or RAG 
    abstract OffLoadContext(): Promise<string>

    abstract appendTurn(context: TContext, res: any, toolRes: any): TContext
}

export class CoderContextManager extends ContextManager<CoderContext>{
    appendTurn(context: CoderContext, res: any, toolRes: any): CoderContext {
        const recentTurns = [...dropStaleReads(context.recentTurns, res), summarizeTurn(res, toolRes)].slice(-RECENT_TURNS_LIMIT)
        return {
            task: context.task, // fixed at task start, doesn't grow per-turn
            dependentSummary: context.dependentSummary, // fixed at task start, doesn't grow per-turn
            repoTree: context.repoTree,
            skills: res?.action === 'getSkill' ? applySkillLoad(context.skills, res, toolRes) : context.skills,
            recentTurns
        }
    }

    override async CompactContext(context: CoderContext): Promise<CoderContext> {
        const len = context.dependentSummary.length
        const olderHalf = context.dependentSummary.slice(0, len/2)
        const recentHalf = context.dependentSummary.slice(len/2, len)

        const olderHalfContext: CoderContext = {
            task: context.task,
            dependentSummary: olderHalf,
            repoTree: context.repoTree,
            skills: context.skills,
            recentTurns: context.recentTurns
        }
        const olderCompacted = await b.CompactCoderContext(COMPACT_CONTEXT_PROMPT, olderHalfContext)

        return {
            task: context.task,
            dependentSummary: [...olderCompacted.dependentSummary, ...recentHalf],
            repoTree: context.repoTree,
            skills: context.skills,
            recentTurns: olderCompacted.recentTurns
        }
    }
    override async SummarizeContext(context: CoderContext): Promise<CoderContext> {
        return await b.SummarizeCoderContext(SUMMARIZE_CONTEXT_PROMPT, context)
    }
    override async IsolateContext(): Promise<string> {
        return await "TODO: implement this"
    }
    override async OffLoadContext(): Promise<string> {
        return await "TODO: implement this"

    }

}
export class DebuggerContextManager extends ContextManager<DebuggerContext>{
    appendTurn(context: DebuggerContext, res: any, toolRes: any): DebuggerContext {
        const label = res?.action ?? 'unknown'
        const recentTurns = [...dropStaleReads(context.recentTurns, res), summarizeTurn(res, toolRes)].slice(-RECENT_TURNS_LIMIT)
        return {
            repoTree: context.repoTree,
            originalError: context.originalError,
            fixHistory: [
                ...context.fixHistory,
                { error: context.originalError, fixSummary: `${label}: ${toolRes.message ?? toolRes.summary ?? JSON.stringify(toolRes).slice(0, 500)}` }
            ],
            skills: res?.action === 'getSkill' ? applySkillLoad(context.skills, res, toolRes) : context.skills,
            recentTurns
        }
    }

    override async CompactContext(context: DebuggerContext): Promise<DebuggerContext> {
        const len = context.fixHistory.length

        const olderHalfContext: DebuggerContext = {
            repoTree: context.repoTree,
            originalError: context.originalError,
            fixHistory: context.fixHistory.slice(0, len/2),
            skills: context.skills,
            recentTurns: context.recentTurns
        }
        const olderCompacted = await b.CompactDebuggerContext(COMPACT_CONTEXT_PROMPT, olderHalfContext)

        return {
            repoTree: context.repoTree,
            originalError: context.originalError,
            fixHistory: [...olderCompacted.fixHistory, ...context.fixHistory.slice(len/2, len)],
            skills: context.skills,
            recentTurns: olderCompacted.recentTurns
        }
    }
    // I don't think we will ever need this coz debugger should fix the error before this could even hit
    override async SummarizeContext(context: DebuggerContext): Promise<DebuggerContext> {
        return await b.SummarizeDebuggerContext(SUMMARIZE_CONTEXT_PROMPT, context)
    }
    override async IsolateContext(): Promise<string> {
        return await "TODO: implement this"
    }
    override async OffLoadContext(): Promise<string> {
        return await "TODO: implement this"

    }

}
