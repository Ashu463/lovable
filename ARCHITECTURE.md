# Architecture

A multi-agent code-generation system. A user prompt becomes a running React app,
built by a DAG of specialised LLM agents working inside isolated sandboxes.

The interesting engineering is in three places: **where work is allowed to pause
and resume**, **how long-running agent work survives process death**, and **how
parallel agents avoid clobbering each other's files**.

---

## 1. System topology

Three processes, deliberately split by what they're allowed to load.

```mermaid
flowchart TB
    subgraph client["Browser"]
        UI["React + Vite<br/>RunProvider state machine"]
    end

    subgraph api["API process :3000"]
        GQL["GraphQL Yoga<br/>schema + resolvers"]
        SUB["runEvents subscription"]
    end

    subgraph worker["Worker process :3001"]
        BMQ["BullMQ consumer<br/>queue: run-agent"]
        CA["CallAgent.Execute<br/>bootstrap + gates"]
        SRV["/api/inngest<br/>Inngest serve handler"]
        ORCH["Orchestrator / Agent<br/>the actual build"]
    end

    subgraph ing["Inngest dev server :8288"]
        DEV["event router<br/>step memoisation"]
    end

    subgraph data["Stateful"]
        PG[("Postgres :5433")]
        RDS[("Redis :6380<br/>queue + pub/sub")]
    end

    subgraph ext["External"]
        E2B["E2B sandboxes"]
        R2["Cloudflare R2<br/>file persistence"]
        LLM["LLMs via BAML"]
        STITCH["Stitch<br/>UI generation"]
    end

    UI -->|"mutations"| GQL
    UI <-->|"SSE"| SUB
    GQL -->|"enqueue job"| RDS
    RDS --> BMQ
    BMQ --> CA
    CA -->|"inngest.send"| DEV
    DEV -->|"HTTP callback"| SRV
    SRV --> ORCH
    GQL <--> PG
    ORCH --> PG
    ORCH -->|"publish"| RDS
    RDS -->|"subscribe"| SUB
    ORCH <--> E2B
    E2B <--> R2
    ORCH --> LLM
    ORCH --> STITCH
```

The API process never imports the agent graph — it only knows how to enqueue.
The worker owns everything heavy, and doubles as the Inngest function host so
Inngest's callbacks land in the process that already has the code loaded.

---

## 2. Request lifecycle

The part most people get wrong: a build is **not** one long request. It's a
short interactive phase that may pause for user input several times, followed by
a durable background phase.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser
    participant A as API :3000
    participant Q as BullMQ
    participant W as Worker
    participant I as Inngest :8288
    participant R as Redis pub/sub

    B->>A: createRun(prompt)
    A->>A: INSERT Run (IN_PROGRESS)
    A->>Q: enqueue job
    A-->>B: Run { id }
    B->>A: subscribe runEvents
    Note over B,A: replay history, then tail live

    Q->>W: job
    W->>W: start / reconnect E2B sandbox
    W->>W: CallAgent.Execute → Bootstrap

    alt needs user input
        W->>R: emit clarification_needed / select_design / ui_preference_needed
        R-->>B: pause event → modal
        Note over W: BullMQ job ENDS here.<br/>Nothing sent to Inngest yet.
        B->>A: continueRun(answers)
        A->>A: persist answers
        A->>Q: re-enqueue SAME runId
        Q->>W: job (round 2)
    end

    W->>I: inngest.send(callAgent/run.simple | .complex)
    W-->>Q: job complete (seconds)
    Note over W,Q: queue slot freed —<br/>no 10-minute job held open

    I->>W: POST /api/inngest
    loop one step per invocation
        W->>W: execute next unmemoised step
        W->>R: emit progress
        R-->>B: live feed
        W-->>I: persist step result
        I->>W: re-invoke from top
    end

    W->>R: emit run_completed
    R-->>B: preview URL, stream closes
```

---

## 3. Run state machine

Every pause is a real persisted state, so a refresh or a worker restart resumes
cleanly rather than orphaning the run.

```mermaid
stateDiagram-v2
    [*] --> IN_PROGRESS: createRun
    IN_PROGRESS --> CLARIFICATION_NEEDED
    IN_PROGRESS --> AWAITING_DESIGN_SELECTION: simple path
    IN_PROGRESS --> AWAITING_UI_PREFERENCE: complex path
    CLARIFICATION_NEEDED --> IN_PROGRESS: continueRun
    AWAITING_DESIGN_SELECTION --> IN_PROGRESS: continueRun
    AWAITING_UI_PREFERENCE --> IN_PROGRESS: continueRun
    IN_PROGRESS --> COMPLETED
    IN_PROGRESS --> FAILED
    IN_PROGRESS --> STOPPED
    COMPLETED --> [*]
    FAILED --> [*]
```

Status transitions are driven by emitted events through a single
`STATUS_FOR_EVENT` map, so the event stream and the database can't disagree.

---

## 4. Bootstrap — the gate chain

Everything that might need to ask the user a question happens here, before any
durable work is dispatched.

```mermaid
flowchart TD
    START([Run picked up]) --> DEV{"Development<br/>request?"}
    DEV -->|no| CHAT["Conversational reply<br/>run_completed"]
    DEV -->|yes| Q{"Unanswered<br/>questions?"}
    Q -->|yes| ASK["PAUSE<br/>clarification_needed"]
    Q -->|no| ANS{"Stored<br/>answers?"}
    ANS -->|yes| FOLD["Fold Q&A into prompt"]
    ANS -->|no| CHECK["Complexity check (cached)<br/>+ clarification checker"]
    CHECK -->|questions| ASK
    CHECK -->|none| CX
    FOLD --> CX{"Complex?"}

    CX -->|"yes"| UIP{"UI preferences<br/>answered?"}
    UIP -->|no| ASKUI["PAUSE<br/>ui_preference_needed"]
    UIP -->|yes| DISPATCHC["send callAgent/run.complex"]

    CX -->|"no"| DES{"Design<br/>selected?"}
    DES -->|no| ASKD["PAUSE<br/>select_design<br/>3 Stitch variants"]
    DES -->|yes| DISPATCHS["send callAgent/run.simple"]

    style ASK fill:#7a3,color:#fff
    style ASKUI fill:#7a3,color:#fff
    style ASKD fill:#7a3,color:#fff
    style DISPATCHC fill:#36c,color:#fff
    style DISPATCHS fill:#36c,color:#fff
```

The two paths diverge on purpose. A simple request gets three generated design
variants to pick from. A complex one skips that entirely — instead it asks a
small set of project-wide UI preference questions once, stores them, and every
UIExpert task from then on reuses the answers.

---

## 5. Complex path — planner, DAG, parallel execution

```mermaid
flowchart TB
    P["Planner LLM<br/>prompt → todos + dependencies"] --> D["DAG<br/>topological sort into levels"]
    D --> L{"Level N"}

    L -->|"1 task"| SINGLE["Run directly against<br/>PROJECT_ROOT"]
    L -->|"2+ tasks"| PAR["Each task in its own<br/>git worktree, in parallel"]

    SINGLE --> GATE
    PAR --> MERGE["Merge worktrees back<br/>to trunk, one at a time"]
    MERGE --> GATE["Merge gate<br/>tester ↔ debugger"]

    GATE -->|"pass"| DEC{"More levels?"}
    GATE -->|"fail"| FAIL["run_failed"]
    DEC -->|"yes"| L
    DEC -->|"no"| SUM["Summarise → preview URL<br/>run_completed"]

    style FAIL fill:#a33,color:#fff
    style SUM fill:#383,color:#fff
```

Parallel tasks at the same DAG level each get a **git worktree**, so two agents
editing the project at once can't corrupt each other. Merges happen serially
afterwards; a genuine conflict surfaces as that task failing rather than being
silently lost.

Agent roles: `coder`, `uiExpert`, `tester`, `debuggerr`, `researcher`.

---

## 6. Merge gate — the self-healing loop

After every level, the build must actually compile before moving on.

```mermaid
flowchart LR
    B["npm run build"] --> OK{"passes?"}
    OK -->|yes| NEXT([next level])
    OK -->|no| T["Tester agent<br/>locate the error"]
    T --> ATTR["Attribute error<br/>to owning task"]
    ATTR --> DBG["Debugger agent<br/>fix it"]
    DBG --> RE["Re-run build"]
    RE --> OK2{"passes?"}
    OK2 -->|yes| NEXT
    OK2 -->|"no, < 3 tries"| T
    OK2 -->|"no, 3 tries"| FAIL(["run_failed"])

    style NEXT fill:#383,color:#fff
    style FAIL fill:#a33,color:#fff
```

Errors are attributed back to the task whose files they came from, so the
debugger gets task context rather than a bare stack trace. Capped at
3 iterations, with repeat-signature detection so it doesn't loop on an error it
isn't actually fixing.

---

## 7. Durability — two retry layers

```mermaid
flowchart TB
    subgraph outer["Inngest: per step, default 4 retries"]
        direction TB
        S1["step: plan"] --> S2["step: level-0-spawn"]
        S2 --> S3["step: level-0-merge-gate"]
        S3 --> S4["step: level-1-spawn"]
        S4 --> S5["step: summarise"]
    end

    subgraph inner["In-step: runSubAgentWithRetry, 2 attempts"]
        A1["subagent attempt 1"] -->|fail| A2["backoff 1s"]
        A2 --> A3["subagent attempt 2"]
    end

    S2 -.->|"contains"| inner
```

The two layers absorb different failures. Ordinary LLM flakiness is retried
**inside** a step, so it never consumes an Inngest attempt. Process death,
sandbox loss and infra failures are absorbed by Inngest **replay** — completed
steps return memoised results instantly, so a crash during level 3 resumes at
level 3 rather than rebuilding from scratch.

This is why orchestrator state is a plain serialisable shape: every value
crossing a step boundary is JSON round-tripped, and a `Map` would silently come
back as `{}`.

---

## 8. Real-time updates

```mermaid
flowchart LR
    AG["Agent emits event"] --> EM["createRunEmitter<br/>fan-out"]
    EM --> BE["recordRunEvent<br/>→ RunEvent row<br/>→ status transition"]
    EM --> RE["Redis publish<br/>run:runId"]
    BE --> PG[("Postgres")]
    RE --> ST["runEvents subscription"]
    PG -->|"replay on connect"| ST
    ST --> UI["Browser feed"]
```

Every event is written **and** published. Redis drives the live feed; the
`RunEvent` table makes a refresh mid-build replay the whole history. Pause
events are excluded from replay and served from a `runState` query instead, so
reconnecting never re-triggers a modal the user already answered.

---

## Stack

| Layer | Choice |
|---|---|
| Monorepo | Turborepo + Bun |
| API | GraphQL Yoga, Prisma, Postgres |
| Queue | BullMQ on Redis |
| Durable execution | Inngest |
| LLM interface | BAML (typed, schema-validated) |
| Sandboxes | E2B, git worktrees for isolation |
| File persistence | Cloudflare R2 |
| UI generation | Stitch |
| Observability | Langfuse tracing |
