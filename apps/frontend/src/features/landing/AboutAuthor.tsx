import { Avatar } from "@/components/ui/avatar";
import { Link } from "react-router-dom";

export function AboutAuthor() {
  return (
    <section id="author" className="mx-auto max-w-3xl px-6 py-24">
      <p className="mb-4 flex items-center gap-3 font-mono text-xs tracking-[0.24em] text-accent uppercase">
        <span className="h-px w-7 bg-accent" />
        who built this
      </p>
      <div className="rounded-2xl border border-border bg-surface p-8">
        <div className="flex items-center gap-4">
          <Avatar name="Ashutosh" src="/ashutosh.jpg" className="h-16 w-16 rounded-xl text-lg" />
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">Ashutosh Kasaudhan</p>
            <p className="font-mono text-xs text-accent">backend & AI systems · built this alone</p>
          </div>
        </div>

        {/* Draft copy — personalize this with your own story before presenting it. */}
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            I&rsquo;ve used tools like Lovable to ship things fast, and the part
            that actually pulled me in wasn&rsquo;t the chat UI — it was
            wondering what has to be true underneath for a prompt to become a
            running, previewable app. An orchestrator deciding when to ask
            clarifying questions versus just building, a planner turning a
            request into a dependency graph of tasks, sub-agents that write
            and test code in a loop, and a way to stream all of that back to a
            browser in real time. That&rsquo;s a real distributed system, not
            a wrapper around an LLM call.
          </p>
          <p>
            So I built one, end to end: a Bun/Turborepo monorepo with an
            orchestrator + sub-agent package, a Postgres/Redis-backed
            backend, and this frontend — to understand every layer well
            enough to defend it in a room, not just demo it. Along the way I
            found and fixed a real bug in my own event pipeline (a few status
            transitions were computed but never actually emitted over SSE) —
            the kind of thing you only find by building the whole thing
            yourself.
          </p>
          <p>
            The <Link to="/architecture" className="text-accent hover:underline">architecture and tradeoffs</Link> behind
            this are written up in detail, including what I&rsquo;d change
            with more time — and the{" "}
            <Link to="/docs" className="text-accent hover:underline">full build journey</Link> goes
            even deeper for anyone who wants the whole story.
          </p>
        </div>
      </div>
    </section>
  );
}
