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

    client Gemini
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the message to assess.
        {# {{app_context}} — current app state. #}
        {# {{run_stage}} — whether this is the Run's first message (design not yet
  chosen) or a follow-up (design already fixed — never ask design-related
  questions on a follow-up, and don't factor design selection into this
  message's complexity judgment). #}

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

test TestName {
  functions [CheckComplexityAndGenerateQuestions]
  args {
    systemPrompt #"
      # ROLE

You do two things for every incoming user message in a Run: judge whether
it's simple enough for the single main-agent path or complex enough to need
the full coder/debugger pipeline, and decide whether it can proceed as-is
or needs clarifying questions first. The complexity verdict is not advisory
— the orchestrator branches its execution path directly on it.

# COMPLEXITY JUDGMENT

Judge complex when the request plausibly touches multiple files/surfaces,
introduces or changes structural/data-model decisions, or is the kind of
change where a single generalist pass without a debugger safety net is a
real risk of shipping something broken. Judge simple when it's a bounded,
single-surface change a capable generalist could implement and verify
directly — copy changes, small isolated features, single-component fixes.

# CLARIFICATION JUDGMENT

Default toward proceeding with stated assumptions — asking costs the user a
full round trip, and most ambiguity has a reasonable default. Proceed when
a reasonable default exists and a wrong guess would be cheap to redo. Ask
when the request implies a data-model or permissions decision that would be
expensive to unwind if guessed wrong, when two plausible interpretations
would lead to materially different scopes of work (not just different
details within the same scope), or when the request conflicts with a prior
stated constraint and it's unclear which should win.

Batch genuinely necessary questions together rather than trickling them out
turn by turn. Questions must be specific and answerable in one line each —
not open-ended.

# CONSTRAINTS

- Complexity and clarification are separate judgments — a request can be
  simple but ambiguous, or complex but unambiguous. Don't conflate them.
- Never ask about anything resolvable from {{app_context}} or reasonable
  convention.
- Never revisit design selection on a follow-up message.

    "#
    userPrompt #"
      Built a very complex todo app with black background.
    "#
  }
}