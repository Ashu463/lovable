import { Sparkles, MessageCircle, Code2, Link2 } from "lucide-react";

const COLUMNS = [
  { title: "Product", links: ["Features", "Pricing", "Enterprise", "Changelog", "Roadmap"] },
  { title: "Resources", links: ["Docs", "Guides", "Templates", "Community", "Blog"] },
  { title: "Company", links: ["About", "Careers", "Press", "Contact", "Brand"] },
  { title: "Legal", links: ["Terms", "Privacy", "Security", "DPA", "Cookies"] },
];

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <a href="#top" className="flex items-center gap-2 font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-accent">
                <Sparkles className="h-4 w-4 text-accent-foreground" />
              </span>
              lovable
            </a>
            <p className="mt-3 text-sm text-muted">
              The AI product studio. Build full-stack apps and websites by chatting.
            </p>
            <div className="mt-4 flex items-center gap-3 text-muted">
              <MessageCircle className="h-4 w-4" />
              <Code2 className="h-4 w-4" />
              <Link2 className="h-4 w-4" />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-muted transition-colors hover:text-foreground">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Lovable, Inc. All rights reserved.</p>
          <p>Made with ♥ in Stockholm & everywhere.</p>
        </div>
      </div>
    </footer>
  );
}
