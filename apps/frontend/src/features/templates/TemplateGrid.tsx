import { useNavigate } from "react-router-dom";
import { TEMPLATES } from "@/features/templates/data";
import { Card } from "@/components/ui/card";

export function TemplateGrid() {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {TEMPLATES.map((t) => (
        <Card
          key={t.id}
          className="cursor-pointer p-5 text-left transition-colors hover:border-border-hover"
          onClick={() => navigate(`/?prompt=${encodeURIComponent(t.prompt)}`)}
        >
          <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-accent">
            <t.icon className="h-4 w-4 text-accent-foreground" />
          </span>
          <p className="text-xs text-muted-foreground">{t.category}</p>
          <h3 className="mt-1 font-medium">{t.title}</h3>
          <p className="mt-1.5 text-sm text-muted">{t.description}</p>
        </Card>
      ))}
    </div>
  );
}
