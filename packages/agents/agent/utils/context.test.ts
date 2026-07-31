// Context-assembly regression tests, split out of skills.test.ts because
// importing utils/context pulls in baml_client, which makes bun's test runner
// intermittently hang for its full timeout on an arbitrary test in the file.
// Isolated here, the blast radius is these two cases.
//
//   bun test packages/agents/agent/utils/context.test.ts

import { test, expect } from "bun:test";
import { SkillStore } from "../skills";
import { CoderContextManager } from "./context";
import { TOOL_RESULT_MAX_CHARS } from "../config/systemConfig";
import type { CoderContext } from "../../baml_client";

const store = new SkillStore();

test("getSkill content reaches context.skills intact, not truncated into recentTurns", async () => {
    // The regression this guards: skill files run to ~4k chars while
    // TOOL_RESULT_MAX_CHARS is 2000, so routing skill content through the
    // normal tool-result path silently cut the middle out of most of them.
    const manager = new CoderContextManager();
    const catalog = await store.getTaskCatalog("coder");
    const target = catalog.find((s) => s.name === "scaffold-new-project")!;
    const full = await store.fetchSkillContent(target.name, "coder");

    expect(full.length).toBeGreaterThan(TOOL_RESULT_MAX_CHARS);

    const context: CoderContext = {
        task: "build a todo app",
        dependentSummary: [],
        repoTree: "./src/App.tsx",
        skills: catalog,
        recentTurns: [],
    };

    const updated = manager.appendTurn(
        context,
        { action: "getSkill", skillName: target.name },
        { success: true, response: full },
    );

    const loaded = updated.skills.find((s) => s.name === target.name)!;
    expect(loaded.content).toBe(full);

    // And the turn itself stays a one-liner rather than duplicating the body.
    const turn = updated.recentTurns.at(-1)!;
    expect(turn.content).toContain("loaded into skills");
    expect(turn.content.length).toBeLessThan(200);
});

test("non-skill tool results are still truncated", async () => {
    const manager = new CoderContextManager();
    const hugeFile = "x".repeat(50_000);
    const context: CoderContext = {
        task: "t", dependentSummary: [], repoTree: "", skills: [], recentTurns: [],
    };

    const updated = manager.appendTurn(
        context,
        { action: "read", path: "src/App.tsx" },
        { success: true, response: hugeFile },
    );

    const turn = updated.recentTurns.at(-1)!;
    expect(turn.content.length).toBeLessThan(TOOL_RESULT_MAX_CHARS + 500);
    expect(turn.content).toContain("chars omitted");
});
