import { FieldNotesPage } from "@/features/shell/FieldNotesPage";
import { FieldNoteEntry } from "@/features/shell/FieldNoteEntry";
import { StatusItem } from "@/features/shell/StatusLine";

const TOC = [
  ["why this stack", "why-this-stack"],
  ["event contract first", "designing-the-event-contract-first"],
  ["the clarify/design gate", "the-clarify-design-gate"],
  ["wiring against the real backend", "wiring-against-the-real-backend-not-mocks"],
  ["two rounds of scope cuts", "two-rounds-of-scope-cuts"],
  ["what's next", "whats-next"],
] as const;

export function Docs() {
  return (
    <FieldNotesPage
      eyebrow="field notes"
      title="The full build journey"
      dek="Not documentation of an API — a log of the tradeoffs made building this engine alone. Each entry is a real fork in the road, what I chose, and what I gave up."
      statusRight={<StatusItem label="entries" value="6" />}
      toc={TOC.map(([label, id]) => (
        <a key={id} href={`#${id}`} className="transition-colors hover:text-foreground">
          {label}
        </a>
      ))}
    >
      <div className="doc-content mt-6">
        <p>
          This is the longer version of the <a href="/architecture">architecture page</a> — the reasoning behind
          each decision, not just the decision itself.
        </p>
      </div>

      <FieldNoteEntry n="01" tag="why this stack" title="Why this stack">
        <p>
          Bun + Turborepo for the monorepo because the backend, the agent
          package, and the frontend all need to share real TypeScript types —
          not duplicated interfaces that drift out of sync. Prisma + Postgres
          for anything that needs to survive a restart (runs, todos, designs,
          questions/answers). BullMQ + Redis for the actual work queue, so an
          HTTP request can return immediately with a run id while a separate
          worker process does the (slow, LLM-bound) work. BAML for the LLM
          calls themselves, because it gives typed, structured outputs
          instead of parsing free-form text. E2B for sandboxed execution, so
          generated code runs somewhere isolated with a real preview URL
          instead of on the host machine.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="02" tag="event contract first" title="Designing the event contract first">
        <p>
          Before writing any frontend UI for the live build experience, the
          first question was: what does the browser actually receive, and
          when? That meant reading <code>packages/agents/agent/events.ts</code>{" "}
          and <code>agent.ts</code> before touching React at all. It&rsquo;s
          also why the frontend imports <code>CallAgentEvent</code>,{" "}
          <code>DesignOption</code>, and <code>Question</code> directly from{" "}
          <code>packages/agents</code> as type-only imports, rather than
          redefining lighter-weight versions locally — they get erased at
          build time, so there&rsquo;s no runtime cost, and the frontend can
          never silently drift from what the orchestrator actually sends.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="03" tag="the clarify/design gate" title="The clarification/design gate">
        <p>
          <code>Bootstrap()</code> deliberately front-loads every expensive
          decision — complexity, clarification, and design selection —
          before <code>Run()</code> commits to actually running
          agents. The reasoning: asking a clarifying question costs one round
          trip, but building the wrong thing and redoing it costs an entire
          pipeline run. It also means a returning user with an
          already-selected design skips straight past that gate on their
          next message, since <code>Bootstrap()</code> checks for an existing
          selected design before generating new ones.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="04" tag="wiring against the real backend" title="Wiring against the real backend, not mocks">
        <p>
          The project&rsquo;s own conventions say: before building a
          component that needs data, check the backend for an existing
          endpoint, and if one doesn&rsquo;t exist, stop and ask instead of
          stubbing it. That rule is directly responsible for two real
          findings in this build: the missing SSE emit calls (see the{" "}
          <a href="/architecture">architecture page</a>), and the missing
          file-read endpoint that the workspace&rsquo;s Code tab needs. Both
          got surfaced and either fixed or explicitly tracked, instead of
          getting quietly faked with placeholder JSON that would have looked
          done in a demo and fallen apart under any real question about it.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="05" tag="two rounds of scope cuts" title="Two rounds of scope cuts">
        <p>
          The first pass built a full marketing-site clone of lovable.dev —
          hero, feature grid, testimonials, pricing, FAQ, the works. That was
          useful for proving the component and SSE architecture end to end,
          but it optimized for the wrong thing for an interview demo: pixel
          cloning a marketing page says nothing about system design. The
          second pass cut all of that down to exactly the parts that
          demonstrate the actual engineering — a real chat-driven build flow
          and a real workspace layout that mirrors how lovable.dev itself is
          structured. The third pass — this one — rebuilt the visual language
          itself around that same idea: the interface should look like the
          instrument panel for a system, not a marketing page for one.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="06" tag="what's next" title="What I'd do differently with more time">
        <ul>
          <li>Persist run/chat state server-side (or in local storage keyed by project) so a refresh mid-build reconnects instead of losing the session.</li>
          <li>Implement <code>POST /chat/:runId/stop</code> for real, including releasing the sandbox.</li>
          <li>Sync R2 more eagerly (or push a file-changed event) so the Code tab doesn&rsquo;t lag behind an in-progress sandbox between syncs.</li>
          <li>Make <code>Run.status</code> transition correctly on <code>select_design</code>, and give design selection its own resume endpoint instead of overloading create-run.</li>
          <li>Add integration tests around the SSE event contract specifically — this is exactly the class of bug (computed but never emitted) that a contract test would have caught immediately.</li>
        </ul>
      </FieldNoteEntry>
    </FieldNotesPage>
  );
}
