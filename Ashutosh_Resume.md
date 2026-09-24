# Ashutosh Kasaudhan

+91-9653501969 · ashukasaudhan971@gmail.com · LinkedIn · Github

## Education

**National Institute of Technology Kurukshetra** — Kurukshetra, HR
Bachelor of Technology in Production and Industrial Engineering · Nov 2022 – May 2026

**St. Xavier's High School** — Balrampur, UP
Senior Secondary Education · Aug 2019 – May 2021

## Experience

**Oppia Foundation** — Open Source Contributor at Google-backed Oppia · Dec 2024 – July 2025 · PR Links
- Automated issue de-assignment for contributors inactive beyond **10 days**, reducing backlogs of PRs.
- Integrated **GraphicsMagick** into **CI pipeline** to flag and compress oversized images in contributor PRs — reduced image sizes by **95%** with lossless compression.
- Migrated OppiaBot to **GitHub Actions**, covering CLA enforcement, PR title/description validation. Collaborated with 15+ contributors in remote setup.

**Samagra Governance** — Backend Intern at a project funded by SamagraX · May 2024 – July 2024 · PR Links
- Built a lightweight identity and access management service modeled on **FusionAuth**, engineered to run within a **150MB memory limit** — making it deployable on low-resources.
- Covered core IAM flows: authentication, authorization, user/identity management, and token/session lifecycle.
- Delivered **15+ production-ready RESTful API** endpoints with **85% test coverage** through unit testing.
- Authored technical documentation with design flow diagrams and Swagger UI.

## Projects

**Andromeda — AI App Builder** | Live | Github Repository · Jun 2026 – Present
- Built a **multi-agent orchestrator–subagent system** that turns a chat prompt into a working, live-previewed React app: an orchestrator decomposes the request into a **dependency DAG** and delegates to **5 specialized subagents** (coder, debugger, tester, UI-designer, researcher).
- Ran independent DAG tasks **in parallel using isolated git worktrees** per task with **LLM-based merge-conflict resolution**, avoiding lock contention while keeping the main branch safe.
- Engineered agent **context/memory management** (two-tier compaction + stale-read eviction) to keep long builds within the model context window, plus a **Tester–Debugger self-healing loop** that halts on repeated error signatures.
- Instrumented the full pipeline with **Langfuse/OpenTelemetry tracing** across **BullMQ + Inngest** step functions, **E2B** sandboxes, and **Cloudflare R2** persistence, with **GraphQL-over-SSE** for live progress streaming.

**API Security Shield** | Documentation | Github Repository · Jul 2024 – Aug 2024
- Developed a **production-minded** e-commerce backend with security as a core concern, covering **OWASP Top 10** vulnerabilities end to end.
- Enforced **application-level** controls: strict input/request validation, utilizing ORM, **JWT** session management, and prevention of mass assignment attacks.
- Designed **AWS cloud infrastructure** with **VPC** isolation, Network ACLs, and Security Groups to restrict network-level access boundaries.
- Configured **Nginx** as a reverse proxy with SSL/TLS termination and **rate limiting** to defend against brute-force and DDoS attack vectors.

**PI-CLI** | npm | Github Repository · Jun 2026 – Jun 2026
- Built pi-cli, a CLI-based AI coding agent harness with a **Commander**-driven REPL and a core **agent loop** supporting tool calls for read, write, edit, and bash execution.
- Designed a **session subsystem** with persistent **memory and context** management, enabling **event-sourced checkpointing** for stateful, resumable multi-turn agent interactions.
- Published the MVP as an npm package (**@ashuk971/nive**), resolving workspace-protocol dependency and bundling issues for public distribution.

## Technical Skills

- **Languages:** C/C++, JavaScript/TypeScript, Python, GoLang
- **Frameworks:** Node.js, Express.js, Nest.js, React.js, Next.js, Jest, PyTest
- **Databases:** MongoDB, PostgreSQL, SQLite, Prisma ORM, Redis
- **AI:** LLM Agent Design, Multi-Agent Orchestration, MCP, Context/Memory Management, LangChain/Custom Agent Frameworks
- **Infra & Cloud:** AWS (EC2, RDS, VPC, Cloudwatch), Azure, Vercel, Docker, Kubernetes, Nginx
- **Developer Tools:** Git, Linux, GitHub Actions (CI/CD)
- **Coursework:** Data Structures & Algorithms, Full Stack Development & DevOps, Artificial Intelligence

## Achievements

- **Problem Solving** — Solved **450+ DSA** problems on LeetCode and GeeksForGeeks.
- **Flipkart Grid 6.0** — Semi-finalist among top national product engineering teams.
- **Smart India Hackathon** — Achieved Top 30 position twice at college level rounds.
- **POR** — Member of Embedded & Robotics Club.
