import { Button } from "@/components/ui/button";

export function FinalCta({ onStartBuilding }: { onStartBuilding: () => void }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-20">
      <div className="hero-glow rounded-3xl border border-border bg-surface/60 px-6 py-16 text-center">
        <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Your next idea is one <span className="text-gradient-accent">prompt away</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-muted">
          Join a million+ builders using Lovable to design, ship, and grow products.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" onClick={onStartBuilding}>
            Start building free
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#pricing">See pricing</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
