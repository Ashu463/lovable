// SkillStore loading contract tests. Deliberately imports nothing that pulls in
// baml_client: doing so makes bun's runner hang ~5s on a random test or two per
// run (see context.test.ts). Keeping this file dependency-free keeps it green.
//
// Skill-loading contract tests. No sandbox, no LLM, no network — this is the
// whole getSkill path from the agent's tool call through to what actually
// lands in context, so a regression here is free to catch.
//
//   bun test packages/agents/agent/skills/skills.test.ts

import { test, expect } from "bun:test";
import { SkillStore } from "./index";

const store = new SkillStore();

test("every skill file parses into a non-empty name, description and content", async () => {
    const skills = [
        ...(await store.globalSkills("coder")),
        ...(await store.getRoleSkills("coder")),
        ...(await store.getTaskSkillsFull("coder")),
    ];
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
        expect({ name: skill.name, hasDesc: !!skill.description, hasContent: !!skill.content })
            .toMatchObject({ hasDesc: true, hasContent: true });
        expect(skill.name).not.toBe("");
    }
});

test("the task catalog advertises names without content, so getSkill has something to fetch", async () => {
    const catalog = await store.getTaskCatalog("coder");
    expect(catalog.length).toBeGreaterThan(0);
    for (const skill of catalog) {
        expect(skill.content).toBeNull();
        expect(skill.name).not.toBe("");
    }
});

// The catalog is what the agent is shown; if a name it reads there can't be
// fetched back, the agent is being offered a skill that doesn't exist. One test
// per agent, because a single test looping all five wedges the bun runner
// (verified as a harness quirk, not a loader problem: the same sequence runs
// clean standalone and the looping test passes in isolation).
for (const agent of ["coder", "tester", "uiExpert"] as const) {
    test(`${agent}: advertised catalog names resolve back to full content`, async () => {
        const catalog = await store.getTaskCatalog(agent);
        expect(catalog.length).toBeGreaterThan(0);

        const lengths: Record<string, number> = {};
        for (const skill of catalog) {
            lengths[skill.name] = (await store.fetchSkillContent(skill.name, agent)).length;
        }

        expect(Object.entries(lengths).filter(([, len]) => len === 0)).toEqual([]);
    });
}

test("an unknown skill name fails loudly rather than returning empty content", async () => {
    await expect(store.fetchSkillContent("not-a-real-skill", "coder"))
        .rejects.toThrow(/Unknown skill/);
});
