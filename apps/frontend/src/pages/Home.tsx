import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Sidebar } from "@/features/shell/Sidebar";
import { HomeChatBox } from "@/features/build/HomeChatBox";
import { AboutAuthor } from "@/features/landing/AboutAuthor";
import { HomeProjectsTabs } from "@/features/landing/HomeProjectsTabs";
import { AnimatedTagline } from "@/features/landing/AnimatedTagline";
import { useAuth } from "@/lib/auth";

export function Home() {
  const { session } = useAuth();
  const firstName = session?.user.name?.split(" ")[0];

  return (
    <div className="flex h-full">
      <Sidebar />

      {/* Transparent on purpose — the heart glow now lives once, behind the
          whole app shell in App.tsx, not re-rendered per page. */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex min-h-[85vh] flex-col items-center justify-center gap-6 px-6 text-center">
          <Link
            to="/architecture"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-4 py-1.5 text-xs text-muted backdrop-blur transition-colors hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            See how this was actually built
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            What&rsquo;s on your mind{firstName ? `, ${firstName}` : ""}?
          </h1>

          <AnimatedTagline />

          <HomeChatBox />
        </div>

        <HomeProjectsTabs />
        <AboutAuthor />

        <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted-foreground">
          <p>
            Built by Ashutosh ·{" "}
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
  );
}
