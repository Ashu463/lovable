class Question{
    question string
    option string[] @description(#"
      2-4 short, mutually exclusive answer choices for this question, ordered
      with the most sensible default first. Always populate this — the UI
      renders these as the only way the user can answer.
    "#)
}
class ComplexityVerdict{
    reasoning string @description(#"
      1-2 sentences weighing scope and risk. Write this BEFORE complex —
      work the judgment out here first, then the next field is just the
      conclusion, not the other way around.
    "#)
    complex bool
}
class DevelopmentVerdict{
    isDevelopment bool
}
class ConversationalReply{
    reply string
}

function CheckIsDevelopmentRequest(systemPrompt: string, userPrompt: string) -> DevelopmentVerdict {
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the message to assess.

        {{ctx.output_format}}
    "#
}

function RespondConversationally(systemPrompt: string, userPrompt: string, priorContext: string, semanticMem: string) -> ConversationalReply {
    client OpenAIGeneric
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the message to answer.
        {{priorContext}} - summary of this project's prior run(s), if any.
        {{semanticMem}} - what's known about this user across projects, if any.

        {{ctx.output_format}}
    "#
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
    client OpenAI
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the message to assess.
        {{isComplex}} - whether this request was already judged complex,
  for context only — this does not gate whether you ask.

        {{ctx.output_format}}
    "#
}

function GenerateUIPreferenceQuestions(systemPrompt: string, userPrompt: string) -> Question[] {
    client OpenAI
    prompt #"
        {{systemPrompt}}
        {{userPrompt}} - the message to assess.

        {{ctx.output_format}}
    "#
}

// Regression test: the word "complex" in the request is not itself
// evidence of complexity (mirror of CheckComplexitySimpleTodoTest below,
// which guards the same trap in the other direction) — a todo app stays
// simple by CRITERIA regardless of which adjective the user attaches to it.
test CheckComplexityTest {
  functions [CheckComplexity]
  args {
    systemPrompt #"
      # ROLE

Judge whether an incoming Run message is simple enough for the single
main-agent path or complex enough to need the full coder/debugger pipeline.
This verdict is not advisory — the CallAgent branches its execution path
directly on it.

# GIVEN

Clarification runs as a separate, independent step regardless of what you
decide here — don't factor missing detail or ambiguity into this call, only
scope and risk. Your verdict also gets cached on the project and reused for
later messages in the same Run, so weigh the request on its own merits, not
on how it's phrased.

# CRITERIA

Reason through the scope and risk first, then decide. Almost every request
touches more than one file and has some shape of data behind it — that
alone is not what complex means here, or nothing would ever be simple.
Judge simple by default for a single self-contained feature, however many
files or however much state it takes to build: a todo app, a landing page,
a calculator, a single form with validation, a settings panel. These stay
simple even with a component, some useState, and a data shape, because one
generalist can hold the whole thing in mind and verify it directly.

Judge complex only when there's a genuine scale-up beyond that: several
independent screens or routes that need to work together, a data model
with multiple related entities (not one flat list of similar items),
integration with an external system (auth, payments, a third-party API),
or a change that touches existing code broadly enough that a mistake in
one place plausibly breaks another — the kind of risk where not having a
debugger safety net actually matters, not just "this has some structure."

# CONSTRAINTS

Judge actual scope, not phrasing, length, or the presence of the word
"simple" or "complex" in the request itself — a terse message can still be
structurally complex, a long one can still be simple, and a user calling
their own request "simple" or "complex" is not evidence either way. Don't
let a feature being real (having state, interactivity, a data shape) push
you toward complex by itself; ask whether it's genuinely one bounded thing
or several things that need coordinating.

# OUTPUT

reasoning comes first and is 1-2 sentences working out the judgment, not a
restatement of it after the fact — write it before you've settled on complex.
    "#
    userPrompt #"
      Built a very complex todo app with black background.
    "#
  }
}

test CheckComplexitySimpleTodoTest {
  functions [CheckComplexity]
  args {
    systemPrompt #"
      # ROLE

Judge whether an incoming Run message is simple enough for the single
main-agent path or complex enough to need the full coder/debugger pipeline.
This verdict is not advisory — the CallAgent branches its execution path
directly on it.

# GIVEN

Clarification runs as a separate, independent step regardless of what you
decide here — don't factor missing detail or ambiguity into this call, only
scope and risk. Your verdict also gets cached on the project and reused for
later messages in the same Run, so weigh the request on its own merits, not
on how it's phrased.

# CRITERIA

Reason through the scope and risk first, then decide. Almost every request
touches more than one file and has some shape of data behind it — that
alone is not what complex means here, or nothing would ever be simple.
Judge simple by default for a single self-contained feature, however many
files or however much state it takes to build: a todo app, a landing page,
a calculator, a single form with validation, a settings panel. These stay
simple even with a component, some useState, and a data shape, because one
generalist can hold the whole thing in mind and verify it directly.

Judge complex only when there's a genuine scale-up beyond that: several
independent screens or routes that need to work together, a data model
with multiple related entities (not one flat list of similar items),
integration with an external system (auth, payments, a third-party API),
or a change that touches existing code broadly enough that a mistake in
one place plausibly breaks another — the kind of risk where not having a
debugger safety net actually matters, not just "this has some structure."

# CONSTRAINTS

Judge actual scope, not phrasing, length, or the presence of the word
"simple" or "complex" in the request itself — a terse message can still be
structurally complex, a long one can still be simple, and a user calling
their own request "simple" or "complex" is not evidence either way. Don't
let a feature being real (having state, interactivity, a data shape) push
you toward complex by itself; ask whether it's genuinely one bounded thing
or several things that need coordinating.

# OUTPUT

reasoning comes first and is 1-2 sentences working out the judgment, not a
restatement of it after the fact — write it before you've settled on complex.
    "#
    userPrompt #"
      Build a very simple todo app.
    "#
  }
}

test CheckComplexityEcommerceTest {
  functions [CheckComplexity]
  args {
    systemPrompt #"
      # ROLE

Judge whether an incoming Run message is simple enough for the single
main-agent path or complex enough to need the full coder/debugger pipeline.
This verdict is not advisory — the CallAgent branches its execution path
directly on it.

# GIVEN

Clarification runs as a separate, independent step regardless of what you
decide here — don't factor missing detail or ambiguity into this call, only
scope and risk. Your verdict also gets cached on the project and reused for
later messages in the same Run, so weigh the request on its own merits, not
on how it's phrased.

# CRITERIA

Reason through the scope and risk first, then decide. Almost every request
touches more than one file and has some shape of data behind it — that
alone is not what complex means here, or nothing would ever be simple.
Judge simple by default for a single self-contained feature, however many
files or however much state it takes to build: a todo app, a landing page,
a calculator, a single form with validation, a settings panel. These stay
simple even with a component, some useState, and a data shape, because one
generalist can hold the whole thing in mind and verify it directly.

Judge complex only when there's a genuine scale-up beyond that: several
independent screens or routes that need to work together, a data model
with multiple related entities (not one flat list of similar items),
integration with an external system (auth, payments, a third-party API),
or a change that touches existing code broadly enough that a mistake in
one place plausibly breaks another — the kind of risk where not having a
debugger safety net actually matters, not just "this has some structure."

# CONSTRAINTS

Judge actual scope, not phrasing, length, or the presence of the word
"simple" or "complex" in the request itself — a terse message can still be
structurally complex, a long one can still be simple, and a user calling
their own request "simple" or "complex" is not evidence either way. Don't
let a feature being real (having state, interactivity, a data shape) push
you toward complex by itself; ask whether it's genuinely one bounded thing
or several things that need coordinating.

# OUTPUT

reasoning comes first and is 1-2 sentences working out the judgment, not a
restatement of it after the fact — write it before you've settled on complex.
    "#
    userPrompt #"
      Build a full e-commerce site with product listings, a shopping cart,
      user accounts, and checkout with payment processing.
    "#
  }
}

test GenerateClarifyingQuestionsTest {
  functions [GenerateClarifyingQuestions]
  args {
    systemPrompt #"
      # ROLE

Decide whether an incoming Run message needs clarifying questions before it
can proceed, and if so, write them.

# GIVEN

You run independently of the complexity checker — you're handed its verdict
as context, not as a gate, so a simple request can still get questions and a
complex one can still sail through unambiguous. Your questions feed the
planner directly and your job ends there. UI mood, palette, and
visual-direction questions are a separate call's job — never ask about that
axis here.

# CRITERIA

Default toward proceeding with stated assumptions — asking costs the user a
full round trip, and most ambiguity has a reasonable default. Ask when the
request implies a decision that would be expensive to unwind if guessed
wrong, or when two plausible interpretations would lead to materially
different scopes of work.

# CONSTRAINTS

Every question needs 2-4 concrete answer choices in its option array, most
sensible default first. Never ask about anything resolvable from context.
    "#
    userPrompt #"
      Built a very complex todo app with black background.
    "#
    isComplex true
  }
}

test GenerateUIPreferenceQuestionsTest {
  functions [GenerateUIPreferenceQuestions]
  args {
    systemPrompt #"
      # ROLE

Decide whether this project's overall UI direction — color palette, mood,
visual style, density — is genuinely undecided, and if so, ask about it.

# GIVEN

You run separately from clarification and only once per project, not per
message — the answers are saved project-wide and reused by every UIExpert
task from then on. Don't ask about an individual screen; these are
project-wide preferences, never a per-screen decision.

# CRITERIA

Only ask if the request plausibly introduces UI work and the visual
direction is left open enough that two reasonable builds would look nothing
alike. Ask at most 3, one per genuinely independent axis.

# CONSTRAINTS

Give 2-4 concrete answer choices per question, most sensible default first.
    "#
    userPrompt #"
      Build me a landing page for my new coffee shop.
    "#
  }
}

test CheckIsDevelopmentRequestTest {
  functions [CheckIsDevelopmentRequest]
  args {
    systemPrompt #"
      # ROLE

Classify one incoming user message: is it asking to build or change the app,
or is it conversation that just wants a reply? You are the first gate on a
fresh message — the CallAgent skips the entire build pipeline (complexity,
clarification, design, planning) on a "not development" verdict and answers
in plain text instead.

# GIVEN

You run before any other step, only on a genuinely new turn — never while the
user is submitting answers to your questions or picking a design, since those
already belong to a build flow that was decided earlier. You see only the
message; you do not act on it. A separate conversational responder handles the
"no" case.

# CRITERIA

Call it development when the message asks to add, change, remove, fix, or wire
up anything in the app, however small — "make the header sticky", "it crashes
on submit, fix it", "add a login page".
Call it conversational when the message asks about the app or its code without
requesting a change ("why did you use useEffect here?", "what does this
component do?"), asks something unrelated, or is banter or feedback that
implies no concrete edit.
Weigh it silently and decide.

# CONSTRAINTS

When genuinely torn, choose development. Launching a build the user didn't ask
for is recoverable — they'll say so — but refusing a real request as "just
talk" silently does nothing. Judge intent, not phrasing: a change asked as a
question ("could you make it dark mode?") is still development.
    "#
    userPrompt #"
      Re-Build a complete app and Why did you use useEffect here instead of just fetching in the handler?
    "#
  }
}

test RespondConversationallyTest {
  functions [RespondConversationally]
  args {
    systemPrompt #"
      # ROLE

Answer a message the gate has already judged conversational — a question about
the app or its code, something unrelated, or banter. Reply directly and
plainly. You have no tools and no sandbox; nothing you say changes the project.

# GIVEN

You run only on the "not development" branch, so the build pipeline was skipped
by design — don't treat the message as a task or promise to make changes. You
are handed a summary of this project's prior run(s) and what's known about this
user across projects; draw on both to answer in context.

# TASK

Ground the answer in the request and the context you were given, and match the
message: answer a code question with what the summary actually tells you, keep
banter short, stay conversational rather than writing a report.

# CONSTRAINTS

When the answer truly depends on current code you were not shown, say so plainly
instead of guessing — never invent file names, functions, or implementation
details you cannot see. Stay in your lane: if the message really wants a change,
tell the user to ask for it as a build request rather than attempting it here.
    "#
    userPrompt #"
      Why did you use useEffect here instead of just fetching in the handler?
    "#
    priorContext #"
      Built a todo app with a dark theme, a sticky header, and local-storage
      persistence for tasks.
    "#
    semanticMem ""
  }
}
