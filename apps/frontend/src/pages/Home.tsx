import { Sidebar } from "@/features/shell/Sidebar";
import { StatusLine, StatusItem, StatusSep } from "@/features/shell/StatusLine";
import { HomeChatBox } from "@/features/build/HomeChatBox";
import { PipelineStrip, type PipelineStage } from "@/features/build/PipelineStrip";
import { EventTicker } from "@/features/landing/EventTicker";
import { AboutAuthor } from "@/features/landing/AboutAuthor";
import { HomeProjectsTabs } from "@/features/landing/HomeProjectsTabs";
import { useAuth } from "@/lib/auth";
import { Link } from "react-router-dom";

// Illustrative, not live — explains the shape of a build for anyone landing
// here cold. The workspace shows the real thing, driven by actual run state.
const DEMO_STAGES: PipelineStage[] = [
  { key: "prompt", label: "prompt", state: "done" },
  { key: "clarify", label: "clarify", state: "done" },
  { key: "design", label: "design", state: "done" },
  { key: "build", label: "plan DAG", state: "active" },
  { key: "sandbox", label: "sandbox", state: "pending" },
  { key: "preview", label: "preview", state: "pending" },
];
const DEMO_AGENTS = [
  { name: "coder", active: true },
  { name: "debuggerr", active: false },
  { name: "tester", active: true },
  { name: "researcher", active: false },
  { name: "uiExpert", active: false },
];

export function Home() {
  const { session } = useAuth();
  const firstName = session?.user.name?.split(" ")[0];

  return (
    <div className="flex h-full">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <StatusLine>
          <StatusItem label="orchestrator" value="online" live />
          <StatusSep />
          <StatusItem label="redis" value="pub/sub" />
          <StatusSep />
          <StatusItem label="sandbox pool" value="3 warm" />
          <StatusSep />
          <StatusItem label="queue" value="0" />
        </StatusLine>

        <main className="flex-1 overflow-y-auto">
          <div className="grid-panel relative px-6 pt-16 pb-10 sm:px-10">
            <div className="mx-auto max-w-3xl">
              <p className="mb-6 flex items-center gap-3 font-mono text-xs tracking-[0.24em] text-accent uppercase">
                <span className="h-px w-8 bg-accent" />
                solo-built · multi-agent app engine
              </p>

              <h1 className="font-display max-w-[16ch] text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
                Describe an app{firstName ? `, ${firstName}` : ""}.<br />
                Watch five agents{" "}
                <span className="text-gradient-accent">build it.</span>
              </h1>

              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
                A prompt goes in. A planner breaks it into a dependency graph, specialised
                agents write, test and debug it inside a live sandbox, and a working preview
                comes back — streamed to you, event by event.
              </p>

              <div className="mt-8">
                <HomeChatBox />
              </div>
            </div>
          </div>

          <PipelineStrip stages={DEMO_STAGES} agents={DEMO_AGENTS} />
          <EventTicker />

          <HomeProjectsTabs />
          <AboutAuthor />

          <footer className="border-t border-border px-6 py-8 text-center font-mono text-xs text-muted-foreground">
            <p>
              Lovable — a solo build by Ashutosh ·{" "}
              <Link to="/architecture" className="hover:text-foreground">
                Architecture
              </Link>{" "}
              ·{" "}
              <Link to="/docs" className="hover:text-foreground">
                Docs
              </Link>
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
