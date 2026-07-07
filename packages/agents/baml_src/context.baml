
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