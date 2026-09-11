# Ashutosh Kasaudhan

**Backend and AI systems engineer.** I build multi-agent LLM systems and the durable
infrastructure that keeps them running — orchestration, sandboxed execution, and
observability — alongside production backends with security as a first-class concern.

📍 Kurukshetra, India · ✉️ ashukasaudhan971@gmail.com · 📱 +91-9653501969
🔗 [LinkedIn](https://linkedin.com) · [GitHub](https://github.com)

---

# Projects

## lovable-clone — Multi-Agent App Builder

**Jun 2026 – Present** · TypeScript, Turborepo, Bun, GraphQL, Postgres, Redis, Inngest, BAML, E2B

A Lovable-style AI app builder: a single user prompt becomes a running React app,
built by a DAG of specialised LLM agents working in isolated cloud sandboxes.
The hard engineering isn't the prompting — it's making long-running agent work
**pausable, crash-proof, and safely parallel**.

**What it does**

A prompt enters, gets classified simple or complex, and passes through a gate chain
that asks the user clarifying questions before any expensive work starts. Simple
requests get three generated design variants to choose from; complex ones answer a
short set of project-wide UI preferences once, then reuse them for every UI task.
From there a planner decomposes the request into a dependency graph of tasks, and
agents build the app level by level until it compiles and a live preview URL is ready.

**Engineering highlights**

- **Durable execution that survives process death.** Builds run as memoised Inngest
  steps rather than one long request, with two independent retry layers — LLM
  flakiness is absorbed *inside* a step, while process crashes and sandbox loss are
  absorbed by replay. A crash during level 3 of a build resumes at level 3 instead of
  starting over.
- **Parallel agents that can't corrupt each other.** Tasks at the same DAG level each
  execute in their own **git worktree**, then merge back to trunk serially — so two
  agents editing the same project concurrently is safe, and a genuine conflict surfaces
  as one failed task rather than silent data loss.
- **A self-healing merge gate.** After every level the project must actually build. On
  failure, a tester agent locates the error, attributes it back to the task whose files
  produced it, and hands that context to a debugger agent to fix — capped at three
  iterations with repeat-signature detection so it never loops on an error it isn't
  fixing.
- **Pauses as real persisted state.** Every point where the build waits on the user is
  a durable run state driven by a single event→status map, so a browser refresh or a
  worker restart resumes cleanly and never re-triggers a question already answered.
- **Two-phase planner.** Planning is split from execution as an independently testable
  unit, letting the design pre-phase generate every screen's UI concurrently with task
  planning instead of after it.
- **Typed LLM boundaries.** All model calls go through BAML for schema-validated
  inputs and outputs, so malformed generations fail loudly at the boundary rather than
  corrupting orchestrator state downstream.
- **Live build feed.** Agent events are written to Postgres *and* published to Redis —
  Redis drives the real-time stream to the browser, while the event table lets a
  mid-build refresh replay the entire history.
- **Extensible agent capabilities.** Five specialised agent roles (coder, UI expert,
  tester, debugger, researcher) on a shared base, backed by a library of ~24 reusable
  skills and an MCP registry integrating Figma, Vercel, Context7, Tavily, and Apify.
- **Full tracing.** Langfuse spans across orchestrator, planner, and every agent call,
  so a slow or expensive build can be traced to the exact step.

**Scale:** 161 commits across a Turborepo monorepo of five workspaces, with the
orchestrator core shared as a single typed contract between API, worker, and frontend.

---

## PI-CLI — CLI-based AI Coding Agent

**Jun 2026** · [npm](https://www.npmjs.com/package/@ashuk971/nive) · [GitHub](https://github.com)

A terminal coding agent harness built around a Commander-driven REPL and a core agent
loop with tool calls for read, write, edit, and bash execution.

- Designed a session subsystem with persistent memory and context management, using
  **event-sourced checkpointing** so multi-turn agent interactions are stateful and
  resumable.
- Published the MVP to npm as `@ashuk971/nive`, resolving workspace-protocol dependency
  and bundling issues for public distribution.

---

## Student Progress Tracker

**Jul 2025** · [Live Site](https://vercel.com) · [GitHub](https://github.com)

A full-stack dashboard for course instructors to monitor the competitive programming
progress of **100+ students** across Codeforces. Built and deployed on Vercel.

- Automated student data sync via cron jobs against the Codeforces API, with email
  alerts flagging prolonged inactivity.
- Integrated AI-powered performance suggestions and problem recommendations from rating
  trends, solved tags, and activity patterns using the Gemini API.

---

## API Security Shield

**Jul 2024 – Aug 2024** · [Documentation](https://github.com) · [GitHub](https://github.com)

A production-minded e-commerce backend built with security as the core concern,
covering the **OWASP Top 10** end to end.

- Enforced application-level controls: strict input and request validation, ORM-mediated
  data access, JWT session management, and mass-assignment prevention.
- Designed AWS infrastructure with VPC isolation, Network ACLs, and Security Groups to
  restrict access at the network boundary.
- Configured Nginx as a reverse proxy with SSL/TLS termination and rate limiting to
  defend against brute-force and DDoS vectors.

---

# Experience

## Open Source Contributor — Oppia Foundation

**Dec 2024 – Jul 2025** · Google-backed Oppia · [PR Links](https://github.com)

- Automated issue de-assignment for contributors inactive beyond 10 days, cutting PR
  backlogs.
- Integrated **GraphicsMagick** into the CI pipeline to flag and compress oversized
  images in contributor PRs — **95% size reduction** with lossless compression.
- Migrated OppiaBot to **GitHub Actions**, covering CLA enforcement and PR
  title/description validation. Collaborated with 15+ contributors in a fully remote
  setup.

## Backend Intern — Samagra Governance

**May 2024 – Jul 2024** · SamagraX-funded project · [PR Links](https://github.com)

- Built a lightweight identity and access management service modelled on FusionAuth,
  engineered to run within a **150MB memory limit** for deployment on low-resource
  hardware.
- Covered the core IAM surface: authentication, authorization, user and identity
  management, and token/session lifecycle.
- Delivered **15+ production-ready REST endpoints** at **85% test coverage**.
- Authored the technical documentation, including design flow diagrams and Swagger UI.

---

# Technical Skills

| Area | Technologies |
| --- | --- |
| **Languages** | TypeScript / JavaScript, C/C++, Python, GoLang |
| **AI & Agents** | LLM agent design, multi-agent orchestration, MCP, context and memory management, BAML, LangChain and custom agent frameworks |
| **Frameworks** | Node.js, Express.js, Nest.js, React.js, Next.js, Jest, PyTest |
| **Databases** | PostgreSQL, MongoDB, Redis, SQLite, Prisma ORM |
| **Infra & Cloud** | AWS (EC2, RDS, VPC, CloudWatch), Azure, Vercel, Docker, Kubernetes, Nginx |
| **Dev Tools** | Git, Linux, GitHub Actions (CI/CD), Turborepo, Bun |

---

# Education

## National Institute of Technology, Kurukshetra

**Nov 2022 – May 2026** · B.Tech, Production and Industrial Engineering · Kurukshetra, HR

Coursework: Data Structures & Algorithms, Full Stack Development & DevOps, Artificial
Intelligence

## St. Xavier's High School

**Aug 2019 – May 2021** · Senior Secondary Education · Balrampur, UP

---

# Achievements

- **450+ DSA problems** solved across [LeetCode](https://leetcode.com) and
  [GeeksForGeeks](https://geeksforgeeks.org).
- **Flipkart Grid 6.0** — Semi-finalist among top national product engineering teams.
- **Smart India Hackathon** — Top 30 at college-level rounds, twice.
- **Member**, Embedded & Robotics Club.
