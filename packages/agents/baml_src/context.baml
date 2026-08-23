
class Decision{
    actor string
    decision string
    accepted string
}
class EpisodicMemory{
    sessionGoal string
    userRequests string[]
    impFacts string[] // inside this session
    decisions string[] // made by LLM and user
    toolResults string[]
    generatedArtifacts string[]
    openTasks string[]
    preferences string[]
    entities string[]
    summary string
}

class Message {
    role "user" | "assistant" | "toolCall" | "system"
    content string
    timestamp string
}
function CompressContext(systemPrompt: string, session: string[]) -> EpisodicMemory{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{session}}

        {{ctx.output_format}}
    "#
}

function SummarizeEpisodic(systemPrompt: string, episodicMem: EpisodicMemory) -> string{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{episodicMem}}

        {{ctx.output_format}}
    "#
}
// Used in Main agent
function CompactContext(systemPrompt: string, context: Message[]) -> Message[]{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}}

        {{ctx.output_format}}
    "#
}
function SummarizeContext(systemPrompt: string, context: Message[]) -> Message[]{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}} - the full context object, already past compaction.

        {{ctx.output_format}}
    "#
}
// Used in Subagents
function CompactCoderContext(systemPrompt: string, context: CoderContext) -> CoderContext{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}} - the full context object, segmented.

        {{ctx.output_format}}
    "#
}
function CompactDebuggerContext(systemPrompt: string, context: DebuggerContext) -> DebuggerContext{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}} - the full context object, segmented.

        {{ctx.output_format}}
    "#
}
function SummarizeCoderContext(systemPrompt: string, context: CoderContext) -> CoderContext{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}} - the full context, already past compaction.

        {{ctx.output_format}}
    "#
}
function SummarizeDebuggerContext(systemPrompt: string, context: DebuggerContext) -> DebuggerContext{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{context}} - the full context, already past compaction.

        {{ctx.output_format}}
    "#
}
