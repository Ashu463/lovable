import { PageShell } from "@/features/shell/PageShell";

export function Privacy() {
  return (
    <PageShell title="Privacy Policy" subtitle="Last updated September 2026">
      <div className="doc-content mt-6 space-y-6">
        <p>
          Praxis is a solo-built project. This page explains what data it
          collects and why, in plain terms.
        </p>

        <div>
          <h3>What we collect</h3>
          <p>
            When you sign in with Google, we receive your email address,
            name, and profile picture from your Google account — used only
            to identify your account and show who you're signed in as.
          </p>
          <p>
            When you ask Praxis to build something, we store the prompt you
            wrote, the project and files it generates, and a log of the
            agent steps taken to produce it (so a run can be resumed or
            reviewed later).
          </p>
        </div>

        <div>
          <h3>How it's used</h3>
          <p>
            Your prompts are sent to third-party LLM providers (OpenAI and
            Anthropic) to generate responses and code. Generated project
            files are stored in Cloudflare R2. Run traces are sent to
            Langfuse for debugging and observability. Generated code may be
            executed in an ephemeral, isolated sandbox (E2B) to test and
            preview it — that sandbox is destroyed after the run.
          </p>
          <p>
            We don't sell your data, and we don't use it for advertising.
          </p>
        </div>

        <div>
          <h3>Data retention</h3>
          <p>
            Project and run data is kept so you can return to past work.
            You can request deletion of your account and associated data at
            any time by contacting us (below).
          </p>
        </div>

        <div>
          <h3>Contact</h3>
          <p>
            Questions about this policy: <a href="mailto:ashukasaudhan971@gmail.com">ashukasaudhan971@gmail.com</a>
          </p>
        </div>
      </div>
    </PageShell>
  );
}
