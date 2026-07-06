

class ErrorResponse{
    error string
    file string
    line int
}
function ReframeError(systemPrompt: string, error: string) -> ErrorResponse{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{error}}

        {{ctx.output_format}}
    "#
}