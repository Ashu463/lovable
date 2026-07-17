

class ErrorResponse{
    error string
    file string
    line int
}
// function TestCodebase(systemPrompt: string) -> string{

//     client 
// }
function ReframeError(systemPrompt: string, error: string) -> ErrorResponse{

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{error}} - unstructured stdout/stderr from a failed
build/lint/test command.


        {{ctx.output_format}}
    "#
}