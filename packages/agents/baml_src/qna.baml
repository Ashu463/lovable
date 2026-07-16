class Question{
    question string
    option string[]
}
class SimpleComplexity{
    complex false
}
class ComplexComplexity{
    complex true
    questions Question[]
}
type ComplexityLevel = SimpleComplexity | ComplexComplexity
function CheckComplexityAndGenerateQuestions(systemPrompt: string, userPrompt: string) -> SimpleComplexity | ComplexComplexity {

    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}}

        {{ctx.output_format}}
    "#
}
// class ComplexityLevel{
//     complex bool
//     qnaNeeded bool
// }
// function CheckComplexity(userPrompt: string, systemPrompt: string) -> ComplexityLevel{

//     client OpenAIGeneric
//     prompt #"
//         {{systemPrompt}}
//         {{userPrompt}}

//         {{ctx.output_format}}
//     "#
// }

// function GenerateQuestion(userPrompt: string, systemPrompt: string) -> Question[]{

//     client OpenAIGeneric
//     prompt #"
//         {{systemPrompt}}
//         {{userPrompt}}

//         {{ctx.output_format}}
//     "#
// }