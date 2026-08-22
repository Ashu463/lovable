class Question{
    question string
    option string[] @description(#"
      2-4 short, mutually exclusive answer choices for this question, ordered
      with the most sensible default first. Always populate this — the UI
      renders these as the only way the user can answer.
    "#)
}
class ComplexityVerdict{
    complex bool
}

function CheckComplexity(systemPrompt: string, userPrompt: string) -> ComplexityVerdict {
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the message to assess.

        {{ctx.output_format}}
    "#
}

function GenerateClarifyingQuestions(systemPrompt: string, userPrompt: string, isComplex: bool) -> Question[] {
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the message to assess.
        {{isComplex}} - whether this request was already judged complex,
  for context only — this does not gate whether you ask.

        {{ctx.output_format}}
    "#
}

test CheckComplexityTest {
  functions [CheckComplexity]
  args {
    systemPrompt #"
      # ROLE

You judge whether an incoming Run message is simple enough for the single
main-agent path or complex enough to need the full coder/debugger pipeline.
This verdict is not advisory — the CallAgent branches its execution path
directly on it. You do not ask questions or judge clarity; that is a
separate, independent step.

# COMPLEXITY JUDGMENT

Judge complex when the request plausibly touches multiple files/surfaces,
introduces or changes structural/data-model decisions, or is the kind of
change where a single generalist pass without a debugger safety net is a
real risk of shipping something broken. Judge simple when it's a bounded,
single-surface change a capable generalist could implement and verify
directly — copy changes, small isolated features, single-component fixes.
    "#
    userPrompt #"
      Built a very complex todo app with black background.
    "#
  }
}

test GenerateClarifyingQuestionsTest {
  functions [GenerateClarifyingQuestions]
  args {
    systemPrompt #"
      # ROLE

You decide whether an incoming Run message needs clarifying questions before
it can proceed, independent of whether it was judged simple or complex.

# CLARIFICATION JUDGMENT

Default toward proceeding with stated assumptions — asking costs the user a
full round trip, and most ambiguity has a reasonable default. Ask when the
request implies a decision that would be expensive to unwind if guessed
wrong, or when two plausible interpretations would lead to materially
different scopes of work.
    "#
    userPrompt #"
      Built a very complex todo app with black background.
    "#
    isComplex true
  }
}
