import { Avatar } from "@/components/ui/avatar";

const TESTIMONIALS = [
  {
    quote: "Lovable turned a weekend idea into a live product that pays my rent. Wild.",
    name: "Priya Chen",
    role: "Indie founder",
  },
  {
    quote: "It's the first AI dev tool that respects design. Real components, real tokens.",
    name: "Andrea Silva",
    role: "Design Lead",
  },
  {
    quote: "Onboarded 12 non-technical PMs in a week. They're shipping prototypes we would've queued.",
    name: "Grace Kim",
    role: "VP Product",
  },
  {
    quote: "We killed our internal tools backlog in a month. The team ships in the mornings now.",
    name: "Daniel Ortiz",
    role: "Head of Ops, Northwind",
  },
  {
    quote: "I don't write boilerplate anymore. I describe a feature and it appears.",
    name: "Tomás Álvarez",
    role: "Staff Engineer",
  },
  {
    quote: "Feels like pair-programming with someone who's read every repo on GitHub.",
    name: "Leo Faraday",
    role: "Founder, Studio Faraday",
  },
];

export function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Loved by builders</h2>
        <p className="mt-4 text-muted">Founders, engineers, and teams ship faster with Lovable.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name} className="rounded-2xl border border-border bg-surface/60 p-6">
            <blockquote className="text-sm text-foreground/90">“{t.quote}”</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <Avatar name={t.name} />
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
