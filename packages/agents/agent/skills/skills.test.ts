import { describe, expect, test } from "bun:test";
import type { Skill } from "../../baml_client";
import { SkillStore } from "./index";

describe("SkillStore.getRoleSkills", () => {
    test("loads the role skills declared for an agent, with content", async () => {
        const skills = await new SkillStore().getRoleSkills("coder");

        expect(skills.map((s) => s.name)).toEqual(["design-system", "dependency-policy"]);
        for (const skill of skills) {
            expect(skill.description.length).toBeGreaterThan(0);
            expect(skill.content?.length ?? 0).toBeGreaterThan(0);
        }
    });

    test("resolves the uiExpert design-system override to the design-ui folder", async () => {
        const [uiDesign] = await new SkillStore().getRoleSkills("uiExpert");
        const raw = await Bun.file(`${import.meta.dir}/design-ui/SKILL.md`).text();

        expect(uiDesign?.name).toBe("design-system");
        expect(uiDesign?.content).toBe(raw.split(/^---$/m)[2]!.trim());
    });

    test("returns no role skills for an agent that declares none", async () => {
        expect(await new SkillStore().getRoleSkills("debuggerr")).toHaveLength(1);
        expect(await new SkillStore().getTaskSkillsFull("debuggerr")).toEqual([]);
    });
});

describe("SkillStore.globalSkills", () => {
    test("always includes project-conventions", async () => {
        const skills = await new SkillStore().globalSkills();

        expect(skills.map((s) => s.name)).toEqual(["project-conventions"]);
    });
});

describe("SkillStore.getTaskCatalog", () => {
    test("strips content so the catalog stays cheap to inline", async () => {
        const store = new SkillStore();
        const catalog = await store.getTaskCatalog("tester");
        const full = await store.getTaskSkillsFull("tester");

        expect(catalog.map((s) => s.name)).toEqual(full.map((s) => s.name));
        expect(catalog.every((s) => s.content === null)).toBe(true);
        expect(full.every((s) => (s.content?.length ?? 0) > 0)).toBe(true);
    });
});

describe("SkillStore.fetchSkillContent", () => {
    test("resolves a skill name back to its file content", async () => {
        const store = new SkillStore();
        const content = await store.fetchSkillContent("add-a-route");
        const [expected] = (await store.getTaskSkillsFull("coder")).filter((s) => s.name === "add-a-route");

        expect(content).toBe(expected?.content ?? "");
    });

    test("throws for an unknown skill name", async () => {
        expect(new SkillStore().fetchSkillContent("does-not-exist")).rejects.toThrow(
            /Unknown skill requested via getSkill/,
        );
    });
});

describe("SkillStore.renderAsText", () => {
    const store = new SkillStore();

    test("renders loaded skills with their body", () => {
        const skills: Skill[] = [{ name: "a", description: "desc a", content: "body a" }];

        expect(store.renderAsText(skills)).toBe("## a\ndesc a\n\nbody a");
    });

    test("renders catalog entries as a getSkill hint", () => {
        const skills: Skill[] = [{ name: "a", description: "desc a", content: null }];

        expect(store.renderAsText(skills)).toBe(
            '## a (call getSkill("a") to load full content)\ndesc a',
        );
    });

    test("separates multiple skills with a blank line", () => {
        const skills: Skill[] = [
            { name: "a", description: "desc a", content: "body a" },
            { name: "b", description: "desc b", content: "body b" },
        ];

        expect(store.renderAsText(skills)).toBe("## a\ndesc a\n\nbody a\n\n## b\ndesc b\n\nbody b");
    });

    test("returns an empty string for no skills", () => {
        expect(store.renderAsText([])).toBe("");
    });
});

describe("SkillStore caching", () => {
    test("reuses the same Skill object for repeated loads of one folder", async () => {
        const store = new SkillStore();
        const first = await store.fetchSkillContent("layout-patterns");
        const [roleSkill] = (await store.getTaskSkillsFull("uiExpert")).filter(
            (s) => s.name === "layout-patterns",
        );

        expect(roleSkill?.content).toBe(first);
    });
});
