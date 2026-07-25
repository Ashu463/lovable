import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { GoogleLoginButton } from "@/features/auth/GoogleLoginButton";

const LINKS = ["Community", "Pricing", "Enterprise", "Learn", "Launched"];

export function Nav({ onGetStarted }: { onGetStarted: () => void }) {
  const { session } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-accent">
            <Sparkles className="h-4 w-4 text-accent-foreground" />
          </span>
          lovable
        </a>

        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          {LINKS.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="transition-colors hover:text-foreground"
            >
              {link}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {session ? (
            <span className="text-sm text-muted">{session.user.name ?? session.user.email}</span>
          ) : (
            <>
              <div className="hidden sm:block">
                <GoogleLoginButton />
              </div>
              <Button size="sm" onClick={onGetStarted}>
                Get started
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
