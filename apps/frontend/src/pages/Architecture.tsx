import { Link } from "react-router-dom";
import { FieldNotesPage } from "@/features/shell/FieldNotesPage";
import { FieldNoteEntry } from "@/features/shell/FieldNoteEntry";
import { BlueprintSchematic } from "@/features/shell/BlueprintSchematic";
import { StatusItem } from "@/features/shell/StatusLine";

const TOC = [
  ["system overview", "system-overview"],
  ["orchestration model", "orchestration-model"],
  ["real-time updates", "real-time-updates"],
  ["reading code", "reading-code"],
  ["tradeoffs & gaps", "tradeoffs-and-known-gaps"],
] as const;

export function Architecture() {
  return (
    <FieldNotesPage
      eyebrow="architecture"
      title="How the build pipeline actually works"
      dek="Not a wrapper around a single LLM call. Every node below is a real service in a Bun/Turborepo monorepo — follow the highlighted critical path a prompt takes through it."
      statusRight={<StatusItem label="DWG" value="LVBL-001 · rev C" />}
      hero={<BlueprintSchematic />}
      toc={TOC.map(([label, id]) => (
        <a key={id} href={`#${id}`} className="transition-colors hover:text-foreground">
          {label}
        </a>
      ))}
    >
      <div className="doc-content mt-6">
        <p>
          This isn&rsquo;t a wrapper around a single LLM call. It&rsquo;s a
          Bun/Turborepo monorepo with three real workspaces: a Postgres +
          Redis + BullMQ backend (Express), an orchestrator/sub-agent package
          that does the actual building, and this React frontend — talking to
          each other over REST and Server-Sent Events.
        </p>
      </div>

      <FieldNoteEntry n="01" tag="system overview" title="Three workspaces, one contract">
        <p>
          <code>apps/backend</code> owns persistence (Prisma/Postgres), job
          queuing (BullMQ over Redis), and the HTTP surface. It never talks to
          an LLM directly — it enqueues a job and a worker process picks it
          up. <code>packages/agents</code> is where the actual agent logic
          lives: an <code>OrchestratorAgent</code>, a planner, and a set of
          sub-agents (coder, tester, researcher, UI expert), all calling out
          to the LLM via BAML-generated clients. The frontend never
          duplicates any of this — it imports the orchestrator&rsquo;s own
          event and response types directly from{" "}
          <code>packages/agents</code>.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="02" tag="orchestration model" title="Bootstrap, then plan, then run">
        <p>
          Every run starts in <code>Orchestrate()</code>, which calls{" "}
          <code>Bootstrap()</code> first. Bootstrap decides three things
          before any code gets written: is this request complex enough to
          need clarifying questions, does the project have a selected design
          yet, and is the request simple enough for one generalist agent or
          does it need the full pipeline. Simple requests go to a single{" "}
          <code>MainAgent</code> loop. Complex requests get planned into a
          dependency graph (<code>PlannerTodo[]</code>), topologically
          sorted, and executed as a sequence of <code>SubAgent</code> runs —
          coder tasks are followed by a tester/debugger loop that keeps
          retrying against the same error signature until it either passes or
          gives up after repeated identical failures, rather than looping
          forever.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="03" tag="real-time updates" title="A bug I found in my own pipeline">
        <p>
          Every meaningful state change is supposed to be pushed to the
          browser as an <code>OrchestratorEvent</code> — published to Redis
          by the worker process, replayed from Postgres on reconnect, and
          streamed to the client as SSE. While wiring the frontend against
          this, I traced the emit path end to end and found that three of the
          most important transitions — <code>clarification_needed</code>,{" "}
          <code>select_design</code>, and <code>run_completed</code> — were
          fully computed by the orchestrator and then just returned as a
          function value. Nothing ever called <code>emitter.emit()</code> for
          them. The SSE stream would show live sub-agent progress and then
          just go silent forever on anything that needed the user&rsquo;s
          input. The fix was small (four <code>emit()</code> calls plus
          widening the event type to actually carry question options and
          design options), but finding it required reading the call chain
          from the HTTP route down through the worker and into the
          orchestrator — the kind of bug that only shows up when you&rsquo;ve
          built the whole vertical slice yourself.
        </p>
        <p>
          One more constraint worth calling out: this SSE stream is
          authenticated with a bearer token, but the browser&rsquo;s native{" "}
          <code>EventSource</code> API can&rsquo;t send custom headers. So the
          frontend doesn&rsquo;t use <code>EventSource</code> at all — it
          hand-rolls SSE parsing over <code>fetch</code>&rsquo;s readable
          stream instead, which is the only way to keep the connection
          authenticated.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="04" tag="reading code" title="Reading code without a live sandbox">
        <p>
          The workspace&rsquo;s Code tab needs to show a project&rsquo;s
          files, but the sandbox that generated them is owned by a worker
          process that may have already exited by the time someone opens that
          tab — E2B sandboxes are ephemeral, not something the backend can
          assume is still alive. Rather than have the Express server
          reconnect to a possibly-dead sandbox,{" "}
          <code>GET /api/project/:projectId/files</code> reads from R2
          instead: <code>E2BSandbox.SyncR2()</code> already mirrors the
          sandbox&rsquo;s files to object storage during the run (it existed
          for restoring a sandbox after a crash), so exposing that same
          durable copy to the frontend meant zero new infrastructure — just a
          new route that lists and reads the existing R2 keys under that
          project&rsquo;s prefix.
        </p>
      </FieldNoteEntry>

      <FieldNoteEntry n="05" tag="tradeoffs and known gaps" title="What's incomplete, on purpose or otherwise">
        <p>Being upfront about what&rsquo;s incomplete, because that&rsquo;s more useful than pretending otherwise:</p>
        <ul>
          <li>
            A run&rsquo;s status in Postgres doesn&rsquo;t transition when{" "}
            <code>select_design</code> fires — it stays <code>IN_PROGRESS</code>{" "}
            even though the orchestrator has already returned. Harmless today
            because design selection resumes as a new run, but it&rsquo;s a
            real inconsistency in the data model.
          </li>
          <li>
            <code>POST /chat/:runId/stop</code> is documented in a route
            comment but was never implemented — the stop button in the
            workspace is visible but intentionally disabled rather than
            faked.
          </li>
          <li>
            The Code tab reads from R2 (the durable, periodically-synced copy
            of the sandbox&rsquo;s files), not a live sandbox connection —
            see <em>Reading code without a live sandbox</em> above. That
            means it can lag slightly behind the sandbox&rsquo;s actual
            current state between syncs, in exchange for not depending on the
            sandbox still being alive.
          </li>
          <li>
            Run state lives in memory on the frontend for this demo —
            refreshing mid-build loses the live connection rather than
            rehydrating from history.
          </li>
          <li>
            Design selection deliberately reuses the existing create-run
            endpoint (passing <code>selectedDesignId</code>) instead of
            adding a dedicated resume endpoint — one fewer endpoint to
            maintain, at the cost of starting a nominally &ldquo;new&rdquo;
            run per design pick.
          </li>
        </ul>
        <p>
          For the day-by-day decisions and why each of these tradeoffs got
          made instead of the alternative, see the{" "}
          <Link to="/docs">full build journey</Link>.
        </p>
      </FieldNoteEntry>
    </FieldNotesPage>
  );
}
