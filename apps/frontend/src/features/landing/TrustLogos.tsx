const LOGOS = ["Klarna", "Vercel", "Shopify", "Linear", "Notion", "Figma"];

export function TrustLogos() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
        <span className="text-xs tracking-widest text-muted-foreground">
          TRUSTED BY TEAMS AT
        </span>
        {LOGOS.map((logo) => (
          <span
            key={logo}
            className="text-lg font-semibold tracking-tight text-muted"
          >
            {logo}
          </span>
        ))}
      </div>
    </div>
  );
}
