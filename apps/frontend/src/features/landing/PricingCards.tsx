import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    tag: "FOR TINKERERS",
    name: "Free",
    price: { monthly: 0, yearly: 0 },
    cta: "Start free",
    variant: "outline" as const,
    features: ["5 daily messages", "Public projects", "Community support", "Lovable subdomain"],
  },
  {
    tag: "FOR CREATORS",
    name: "Pro",
    price: { monthly: 25, yearly: 20 },
    cta: "Get started",
    variant: "primary" as const,
    popular: true,
    features: ["100 messages / day", "Private projects", "Custom domains", "GitHub sync", "Priority AI capacity"],
  },
  {
    tag: "FOR SMALL TEAMS",
    name: "Teams",
    price: { monthly: 60, yearly: 50 },
    cta: "Get started",
    variant: "outline" as const,
    features: ["Everything in Pro", "Multiplayer editing", "Role-based access", "Team billing", "Shared secrets"],
  },
  {
    tag: "FOR COMPANIES",
    name: "Enterprise",
    price: null,
    cta: "Contact sales",
    variant: "outline" as const,
    features: ["SSO / SAML", "SOC 2 & DPA", "Dedicated capacity", "Onboarding & training", "24/7 support"],
  },
];

export function PricingCards() {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Simple, honest pricing</h2>
        <p className="mt-4 text-muted">Start free. Upgrade when you&rsquo;re ready to ship.</p>
      </div>

      <div className="mb-12 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          <button
            onClick={() => setYearly(false)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              !yearly ? "bg-foreground text-background" : "text-muted",
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setYearly(true)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              yearly ? "bg-foreground text-background" : "text-muted",
            )}
          >
            Yearly <span className="text-accent">-20%</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "relative rounded-2xl border p-6",
              tier.popular ? "border-accent" : "border-border",
            )}
          >
            {tier.popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                MOST POPULAR
              </span>
            )}
            <p className="text-xs tracking-widest text-muted-foreground">{tier.tag}</p>
            <h3 className="mt-2 text-xl font-semibold">{tier.name}</h3>
            <p className="mt-4 flex items-baseline gap-1">
              {tier.price ? (
                <>
                  <span className="text-4xl font-bold">
                    ${yearly ? tier.price.yearly : tier.price.monthly}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </>
              ) : (
                <span className="text-4xl font-bold">Custom</span>
              )}
            </p>

            <Button variant={tier.variant} className="mt-6 w-full">
              {tier.cta}
            </Button>

            <ul className="mt-6 space-y-3">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-muted">
                  <Check className="h-4 w-4 shrink-0 text-accent" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
