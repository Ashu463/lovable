import { PageShell } from "@/features/shell/PageShell";

export function Terms() {
  return (
    <PageShell title="Terms of Service" subtitle="Last updated September 2026">
      <div className="doc-content mt-6 space-y-6">
        <p>
          Praxis is a solo-built, actively-developed project. By using it,
          you agree to the following.
        </p>

        <div>
          <h3>The service</h3>
          <p>
            Praxis generates code and applications from natural-language
            prompts using AI agents. Output is generated automatically and
            may contain mistakes, bugs, or unexpected behavior — review
            anything generated before relying on it, especially for
            production use.
          </p>
        </div>

        <div>
          <h3>Your content</h3>
          <p>
            You retain ownership of the prompts you write and the projects
            generated from them. Don't submit content you don't have the
            right to use, or use the service to generate anything illegal,
            harmful, or infringing.
          </p>
        </div>

        <div>
          <h3>No warranty</h3>
          <p>
            The service is provided "as is," without warranty of any kind.
            As a solo project, uptime, availability, and data durability
            aren't guaranteed. Back up anything you can't afford to lose.
          </p>
        </div>

        <div>
          <h3>Changes</h3>
          <p>
            Features, pricing, and these terms may change as the project
            evolves. Continued use after a change means you accept the
            updated terms.
          </p>
        </div>

        <div>
          <h3>Contact</h3>
          <p>
            Questions: <a href="mailto:ashukasaudhan971@gmail.com">ashukasaudhan971@gmail.com</a>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
