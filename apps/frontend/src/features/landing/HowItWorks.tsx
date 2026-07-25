const STEPS = [
  {
    number: "01",
    title: "Describe your idea",
    description: "Chat naturally. Paste a Figma link, a sketch, or a spec — Lovable understands.",
  },
  {
    number: "02",
    title: "Watch it come to life",
    description: "The agent scaffolds pages, wires up state, and generates a design system in seconds.",
  },
  {
    number: "03",
    title: "Refine with a prompt",
    description: "Change a color, add a feature, connect an API — small edits or full-stack changes.",
  },
  {
    number: "04",
    title: "Publish anywhere",
    description: "Deploy on Lovable Cloud, export to GitHub, or bring your own hosting.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <span className="inline-flex rounded-full border border-border bg-surface px-4 py-1.5 text-xs text-muted">
          How it works
        </span>
        <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Four steps to your next product
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step) => (
          <div key={step.number} className="rounded-2xl border border-border bg-surface/60 p-6">
            <span className="text-sm font-semibold text-accent">{step.number}</span>
            <h3 className="mt-3 font-semibold">{step.title}</h3>
            <p className="mt-2 text-sm text-muted">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
