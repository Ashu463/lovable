class Question{
    question string
    option Option[]
}
class Option{
    text string
}
function GenerateQuestion(prompt: string, questionPrompt: string) -> Question[]{

    client "openai-generic/deepseek-v4-flash"
    prompt #"
        {{questionPrompt}}
        {{prompt}}

    "#
}