import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    question: "Do I need to know how to code?",
    answer:
      "No. Describe what you want in plain language and Lovable writes the code. If you do know how to code, you can jump into the generated files and edit directly.",
  },
  {
    question: "What's under the hood?",
    answer:
      "Every project is a real React, TypeScript, and Tailwind codebase — not a proprietary format. It's backed by a real Git repo you can clone at any time.",
  },
  {
    question: "Can I use my own domain?",
    answer:
      "Yes, on the Pro plan and above. Point a custom domain at your project and Lovable handles TLS and CDN for you.",
  },
  {
    question: "How does billing work?",
    answer:
      "Plans are billed monthly or yearly (yearly saves 20%). You can upgrade, downgrade, or cancel at any time from account settings.",
  },
  {
    question: "Is Lovable secure?",
    answer:
      "Projects run with row-level security policies, encrypted secret storage, and audit logs. Enterprise plans add SSO/SAML and SOC 2 documentation.",
  },
  {
    question: "Can I collaborate with my team?",
    answer:
      "Yes. Teams and Enterprise plans support multiplayer editing, comments, and role-based access to projects.",
  },
];

export function FaqAccordion() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl">
        Frequently asked
      </h2>

      <Accordion type="single" collapsible className="rounded-2xl border border-border bg-surface/60 px-6">
        {FAQS.map((faq) => (
          <AccordionItem key={faq.question} value={faq.question}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent>{faq.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
