import { PageShell } from "@/features/shell/PageShell";
import { TemplateGrid } from "@/features/templates/TemplateGrid";

export function Resources() {
  return (
    <PageShell title="Resources" subtitle="Freely available templates to start a build from — pick one to prefill the prompt.">
      <TemplateGrid />
    </PageShell>
  );
}
