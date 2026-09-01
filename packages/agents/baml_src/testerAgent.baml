

class ErrorResponse{
    error string
    file string
    line int
}
// function TestCodebase(systemPrompt: string) -> string{

//     client 
// }
function ReframeError(systemPrompt: string, error: string, context: TesterContext) -> ErrorResponse{

    client GroqArray
    prompt #"
        {{systemPrompt}}
        {{error}} - unstructured stdout/stderr from a failed
build/lint/test command.
        {{context}} - carries the skills always attached to Tester (acceptance
  criteria, smoke checklist) plus visual-verification, so reframing stays
  consistent with what "done" means for this project.


        {{ctx.output_format}}
    "#
}