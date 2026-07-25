import { useState } from "react";
import { Eye, GitFork, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const FILTERS = [
  "Popular",
  "Discover",
  "Internal Tools",
  "Website",
  "Personal",
  "Consumer App",
  "B2B App",
  "Prototype",
];

const PROJECTS = [
  { title: "Aurora — AI Notebook", by: "sana.co", views: "48.2k", remixes: "1,284", gradient: "from-orange-600 to-red-800" },
  { title: "Fleetly Dashboard", by: "acme labs", views: "31.7k", remixes: "902", gradient: "from-sky-600 to-teal-800" },
  { title: "Pastel Portfolio", by: "juno.dev", views: "112k", remixes: "3,120", gradient: "from-fuchsia-600 to-purple-900" },
  { title: "Recipe Radar", by: "kitchen.io", views: "12.4k", remixes: "445", gradient: "from-yellow-600 to-lime-800" },
  { title: "Momentum CRM", by: "north.build", views: "76k", remixes: "2,210", gradient: "from-indigo-600 to-violet-900" },
  { title: "Habit Garden", by: "grow.app", views: "58k", remixes: "1,780", gradient: "from-emerald-600 to-green-900" },
  { title: "Studio Booking", by: "beam.studio", views: "18k", remixes: "620", gradient: "from-rose-600 to-orange-900" },
  { title: "Nomad Guide", by: "roam.travel", views: "27k", remixes: "980", gradient: "from-cyan-600 to-blue-900" },
];

export function CommunityGrid() {
  const [active, setActive] = useState("Popular");

  return (
    <section id="community" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">From the community</h2>
          <p className="mt-2 text-muted">Explore what people are shipping with Lovable.</p>
        </div>
        <a href="#" className="text-sm text-muted transition-colors hover:text-foreground">
          View all →
        </a>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActive(filter)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              active === filter
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PROJECTS.map((project) => (
          <article
            key={project.title}
            className="overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-hover"
          >
            <div className={cn("relative h-40 bg-gradient-to-br", project.gradient)}>
              <Badge className="absolute left-3 top-3 bg-black/40 text-white">Remix</Badge>
            </div>
            <div className="p-4">
              <h3 className="font-medium">{project.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">by {project.by}</p>
              <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" /> {project.views}
                  </span>
                  <span className="flex items-center gap-1">
                    <GitFork className="h-3.5 w-3.5" /> {project.remixes}
                  </span>
                </div>
                <Heart className="h-4 w-4 transition-colors hover:text-accent" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
