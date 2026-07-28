import { describe, expect, test } from "bun:test";
import type { OrchestratorEvent } from "../../../../../packages/agents/agent/events";
import { describeEvent } from "./describeEvent";

describe("describeEvent", () => {
  test("describes the orchestrator lifecycle events", () => {
    expect(describeEvent({ type: "orchestrator_agent_started" })).toBe("Planning the build…");
    expect(describeEvent({ type: "main_agent_success" })).toBe("Agent finished its task.");
    expect(describeEvent({ type: "orchestrator_completed", summary: "Shipped the app." })).toBe(
      "Shipped the app.",
    );
  });

  test("names the tool for a main agent tool call", () => {
    expect(describeEvent({ type: "main_agent_tool_call", step: 3, toolName: "writeFile" })).toBe(
      "Running writeFile…",
    );
  });

  test("maps every main_agent_progress step", () => {
    expect(describeEvent({ type: "main_agent_progress", step: "toolCall", toolCall: "readFile" })).toBe(
      "Calling readFile…",
    );
    expect(describeEvent({ type: "main_agent_progress", step: "llm_completed" })).toBe(
      "Model responded.",
    );
    expect(describeEvent({ type: "main_agent_progress", step: "llm_failed" })).toBe(
      "Model call failed.",
    );
  });

  test("falls back to 'a tool' when a toolCall step carries no tool name", () => {
    expect(describeEvent({ type: "main_agent_progress", step: "toolCall" })).toBe(
      "Calling a tool…",
    );
  });

  test("prefers a subagent's own summary over the generic working message", () => {
    expect(
      describeEvent({ type: "subagent_progress", agent: "coder", subagentSummary: "Wrote App.tsx" }),
    ).toBe("Wrote App.tsx");
    expect(describeEvent({ type: "subagent_progress", agent: "coder" })).toBe("coder is working…");
  });

  test("describes subagent completion with its summary", () => {
    expect(
      describeEvent({ type: "subagent_completed", agent: "tester", taskId: 2, summary: "all green" }),
    ).toBe("tester finished: all green");
  });

  test("falls back to 'Working…' for events with no user-facing copy", () => {
    const events: OrchestratorEvent[] = [
      { type: "clarification_needed", questions: [] },
      { type: "select_design", designs: [] },
      { type: "run_failed", error: "boom" },
    ];

    for (const event of events) {
      expect(describeEvent(event)).toBe("Working…");
    }
  });
});
