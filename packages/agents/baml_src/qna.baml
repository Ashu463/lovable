class Question{
    question string
    option string[]
}
class ComplexityLevel{
    complex bool
    qnaNeeded bool
}
function CheckComplexity(userPrompt: string, systemPrompt: string) -> ComplexityLevel{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}
    "#
}
function GenerateQuestion(userPrompt: string, systemPrompt: string) -> Question[]{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}
    "#
}