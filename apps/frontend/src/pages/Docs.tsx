import { DocPage } from "@/features/shell/DocPage";

export function Docs() {
  return (
    <DocPage eyebrow="DOCS" title="The full build journey">
      <div className="doc-content">
        <p>
          This is the longer version of the{" "}
          <a href="/architecture">architecture page</a> — the reasoning behind
          each decision, not just the decision itself.
        </p>

        <h2>Why this stack</h2>
        <p>
          Bun + Turborepo for the monorepo because the backend, the agent
          package, and the frontend all need to share real TypeScript types —
          not duplicated interfaces that drift out of sync. Prisma + Postgres
          for anything that needs to survive a restart (runs, todos, designs,
          questions/answers). BullMQ + Redis for the actual work queue, so an
          HTTP request can return immediately with a run id while a separate
          worker process does the (slow, LLM-bound) work. BAML for the LLM
          calls themselves, because it gives typed, structured outputs instead
          of parsing free-form text. E2B for sandboxed execution, so
          generated code runs somewhere isolated with a real preview URL
          instead of on the host machine.
        </p>

        <h2>Designing the event contract first</h2>
        <p>
          Before writing any frontend UI for the live build experience, the
          first question was: what does the browser actually receive, and
          when? That meant reading <code>packages/agents/agent/events.ts</code>{" "}
          and <code>agent.ts</code> before touching React at all. It&rsquo;s also
          why the frontend imports <code>OrchestratorEvent</code>,{" "}
          <code>DesignOption</code>, and <code>Question</code> directly from{" "}
          <code>packages/agents</code> as type-only imports, rather than
          redefining lighter-weight versions locally — they get erased at
          build time, so there&rsquo;s no runtime cost, and the frontend can never
          silently drift from what the orchestrator actually sends.
        </p>

        <h2>The clarification/design gate</h2>
        <p>
          <code>Bootstrap()</code> deliberately front-loads every expensive
          decision — complexity, clarification, and design selection — before{" "}
          <code>Orchestrate()</code> commits to actually running agents. The
          reasoning: asking a clarifying question costs one round trip, but
          building the wrong thing and redoing it costs an entire pipeline
          run. It also means a returning user with an already-selected design
          skips straight past that gate on their next message, since{" "}
          <code>Bootstrap()</code> checks for an existing selected design
          before generating new ones.
        </p>

        <h2>Wiring against the real backend, not mocks</h2>
        <p>
          The project&rsquo;s own conventions say: before building a component
          that needs data, check the backend for an existing endpoint, and if
          one doesn&rsquo;t exist, stop and ask instead of stubbing it. That rule
          is directly responsible for two real findings in this build: the
          missing SSE emit calls (see the architecture page), and the missing
          file-read endpoint that the workspace&rsquo;s Code tab needs. Both got
          surfaced and either fixed or explicitly tracked, instead of getting
          quietly faked with placeholder JSON that would have looked done in a
          demo and fallen apart under any real question about it.
        </p>

        <h2>Two rounds of scope cuts</h2>
        <p>
          The first pass built a full marketing-site clone of lovable.dev —
          hero, feature grid, testimonials, pricing, FAQ, the works. That was
          useful for proving the component and SSE architecture end to end,
          but it optimized for the wrong thing for an interview demo: pixel
          cloning a marketing page says nothing about system design. The
          second pass cut all of that down to exactly the parts that
          demonstrate the actual engineering — a real chat-driven build flow,
          a real workspace layout that mirrors how lovable.dev itself is
          structured, and this documentation of the tradeoffs, in exchange for
          dropping everything that was just marketing copy.
        </p>

        <h2>What I&rsquo;d do differently with more time</h2>
        <ul>
          <li>Persist run/chat state server-side (or in local storage keyed by project) so a refresh mid-build reconnects instead of losing the session.</li>
          <li>Implement <code>POST /chat/:runId/stop</code> for real, including releasing the sandbox.</li>
          <li>Sync R2 more eagerly (or push a file-changed event) so the Code tab doesn&rsquo;t lag behind an in-progress sandbox between syncs.</li>
          <li>Make <code>Run.status</code> transition correctly on <code>select_design</code>, and give design selection its own resume endpoint instead of overloading create-run.</li>
          <li>Add integration tests around the SSE event contract specifically — this is exactly the class of bug (computed but never emitted) that a contract test would have caught immediately.</li>
        </ul>
      </div>
    </DocPage>
  );
}
