import {
  Bot,
  Database,
  Palette,
  GitBranch,
  Zap,
  Lock,
  Rocket,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Bot,
    title: "AI that codes",
    description: "Describe what you want. Lovable writes production-ready React, TypeScript, and Tailwind.",
  },
  {
    icon: Database,
    title: "Built-in backend",
    description: "Auth, database, storage, and functions — provisioned automatically when you need them.",
  },
  {
    icon: Palette,
    title: "Beautiful by default",
    description: "A design system with tokens, dark mode, and thoughtful components out of the box.",
  },
  {
    icon: GitBranch,
    title: "Real Git under the hood",
    description: "Every project is a proper repo. Sync to GitHub, branch, review, and roll back.",
  },
  {
    icon: Zap,
    title: "Instant preview",
    description: "See changes reflected live as you chat. No build steps, no waiting around.",
  },
  {
    icon: Lock,
    title: "Secure by design",
    description: "RLS policies, secret management, and audit logs so you can ship with confidence.",
  },
  {
    icon: Rocket,
    title: "One-click deploy",
    description: "Publish to a custom domain, or connect your own. TLS and CDN included.",
  },
  {
    icon: Globe,
    title: "Multiplayer",
    description: "Invite your team, comment on projects, and build together in real time.",
  },
];

export function FeaturesGrid() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Everything you need to go from{" "}
          <span className="text-gradient-accent">idea to production</span>
        </h2>
        <p className="mt-4 text-muted">
          Lovable is a full-stack platform — not just a code generator. Design, build, deploy, and iterate.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="p-6">
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-accent">
              <Icon className="h-5 w-5 text-accent-foreground" />
            </span>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted">{description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
