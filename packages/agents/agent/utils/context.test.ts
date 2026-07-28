import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { CoderContext, DebuggerContext, Message } from "../../baml_client";
import { RECENT_TURNS_LIMIT } from "../config/systemConfig";

// The generated baml client boots its native runtime on import, which stalls the
// test runner — and these context reducers only need the LLM calls stubbed out.
const bamlCalls: { name: string; prompt: string; context: unknown }[] = [];
const record =
    <T>(name: string, reply: (context: T) => T) =>
    async (prompt: string, context: T): Promise<T> => {
        bamlCalls.push({ name, prompt, context });
        return reply(context);
    };

mock.module("../../baml_client", () => ({
    b: {
        CompactCoderContext: record<CoderContext>("CompactCoderContext", (context) => ({
            ...context,
            dependentSummary: [{ taskId: "compacted", summary: "compacted summary" }],
            recentTurns: [turn(0)],
        })),
        CompactDebuggerContext: record<DebuggerContext>("CompactDebuggerContext", (context) => ({
            ...context,
            fixHistory: [{ error: context.originalError, fixSummary: "compacted fixes" }],
            recentTurns: [turn(0)],
        })),
        SummarizeCoderContext: record<CoderContext>("SummarizeCoderContext", (context) => ({
            ...context,
            task: "summarized task",
        })),
        SummarizeDebuggerContext: record<DebuggerContext>("SummarizeDebuggerContext", (context) => ({
            ...context,
            originalError: "summarized error",
        })),
    },
}));

const { CoderContextManager, DebuggerContextManager } = await import("./context");

function turn(i: number): Message {
    return { role: "toolCall", content: `turn ${i}`, timestamp: "2026-01-01T00:00:00.000Z" };
}

function coderContext(overrides: Partial<CoderContext> = {}): CoderContext {
    return {
        task: "build a landing page",
        dependentSummary: [{ taskId: "1", summary: "scaffolded the app" }],
        repoTree: "src/index.ts",
        skills: [{ name: "design-system", description: "tokens", content: "body" }],
        recentTurns: [],
        ...overrides,
    };
}

function debuggerContext(overrides: Partial<DebuggerContext> = {}): DebuggerContext {
    return {
        repoTree: "src/index.ts",
        originalError: "TS2304: Cannot find name 'foo'",
        fixHistory: [],
        skills: [],
        recentTurns: [],
        ...overrides,
    };
}

beforeEach(() => {
    bamlCalls.length = 0;
});

describe("CoderContextManager.appendTurn", () => {
    const manager = new CoderContextManager();

    test("appends one summarized turn and leaves the rest of the context untouched", () => {
        const context = coderContext();
        const next = manager.appendTurn(context, { action: "writeFile", path: "src/App.tsx" }, {
            response: "written",
        });

        expect(next.recentTurns).toHaveLength(1);
        expect(next.recentTurns[0]).toEqual({
            role: "toolCall",
            content: "writeFile src/App.tsx -> written",
            timestamp: next.recentTurns[0]!.timestamp,
        });
        expect(next.task).toBe(context.task);
        expect(next.dependentSummary).toBe(context.dependentSummary);
        expect(next.repoTree).toBe(context.repoTree);
        expect(next.skills).toBe(context.skills);
    });

    test("does not mutate the context it was given", () => {
        const context = coderContext();
        manager.appendTurn(context, { action: "runCommand", command: "bun test" }, { response: "ok" });

        expect(context.recentTurns).toEqual([]);
    });

    test("stamps an ISO timestamp on the appended turn", () => {
        const next = manager.appendTurn(coderContext(), { action: "readFile" }, { response: "ok" });

        expect(next.recentTurns[0]!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    });

    test("labels the turn with command or skillName when there is no path", () => {
        const withCommand = manager.appendTurn(coderContext(), { action: "runCommand", command: "ls" }, {
            response: "ok",
        });
        const withSkill = manager.appendTurn(coderContext(), { action: "getSkill", skillName: "add-a-route" }, {
            response: "loaded",
        });

        expect(withCommand.recentTurns[0]!.content).toBe("runCommand ls -> ok");
        expect(withSkill.recentTurns[0]!.content).toBe("getSkill add-a-route -> loaded");
    });

    test("falls back to 'unknown' with no label when the action is missing", () => {
        const next = manager.appendTurn(coderContext(), {}, { response: "ok" });

        expect(next.recentTurns[0]!.content).toBe("unknown -> ok");
    });

    test("prefers response, then editedFiles, then toolResult, then JSON for the result text", () => {
        const of = (toolRes: unknown) =>
            manager.appendTurn(coderContext(), { action: "act" }, toolRes).recentTurns[0]!.content;

        expect(of({ response: "r", editedFiles: "e", toolResult: "t" })).toBe("act -> r");
        expect(of({ editedFiles: "e", toolResult: "t" })).toBe("act -> e");
        expect(of({ toolResult: "t" })).toBe("act -> t");
        expect(of({ other: 1 })).toBe('act -> {"other":1}');
        expect(of({ response: { nested: true } })).toBe('act -> {"response":{"nested":true}}');
    });

    test("keeps only the most recent RECENT_TURNS_LIMIT turns", () => {
        const existing = Array.from({ length: RECENT_TURNS_LIMIT }, (_, i) => turn(i));
        const next = manager.appendTurn(coderContext({ recentTurns: existing }), { action: "act" }, {
            response: "newest",
        });

        expect(next.recentTurns).toHaveLength(RECENT_TURNS_LIMIT);
        expect(next.recentTurns[0]!.content).toBe("turn 1");
        expect(next.recentTurns.at(-1)!.content).toBe("act -> newest");
    });
});

describe("CoderContextManager.CompactContext", () => {
    const manager = new CoderContextManager();

    test("only sends the older half of the dependent summaries to the model", async () => {
        const dependentSummary = Array.from({ length: 4 }, (_, i) => ({
            taskId: String(i),
            summary: `summary ${i}`,
        }));

        await manager.CompactContext(coderContext({ dependentSummary }));

        expect(bamlCalls).toHaveLength(1);
        expect(bamlCalls[0]!.name).toBe("CompactCoderContext");
        expect((bamlCalls[0]!.context as CoderContext).dependentSummary).toEqual(dependentSummary.slice(0, 2));
    });

    test("keeps the recent half verbatim after the compacted older half", async () => {
        const dependentSummary = Array.from({ length: 4 }, (_, i) => ({
            taskId: String(i),
            summary: `summary ${i}`,
        }));

        const compacted = await manager.CompactContext(coderContext({ dependentSummary }));

        expect(compacted.dependentSummary).toEqual([
            { taskId: "compacted", summary: "compacted summary" },
            ...dependentSummary.slice(2),
        ]);
        expect(compacted.recentTurns).toEqual([turn(0)]);
    });

    test("carries task, repoTree and skills through untouched", async () => {
        const context = coderContext();
        const compacted = await manager.CompactContext(context);

        expect(compacted.task).toBe(context.task);
        expect(compacted.repoTree).toBe(context.repoTree);
        expect(compacted.skills).toBe(context.skills);
    });
});

describe("CoderContextManager other reductions", () => {
    const manager = new CoderContextManager();

    test("SummarizeContext hands the whole context to the model", async () => {
        const context = coderContext();
        const summarized = await manager.SummarizeContext(context);

        expect(bamlCalls.map((c) => c.name)).toEqual(["SummarizeCoderContext"]);
        expect(bamlCalls[0]!.context).toBe(context);
        expect(summarized.task).toBe("summarized task");
    });

    test("IsolateContext and OffLoadContext are still stubs", async () => {
        expect(await manager.IsolateContext()).toBe("TODO: implement this");
        expect(await manager.OffLoadContext()).toBe("TODO: implement this");
    });
});

describe("DebuggerContextManager.appendTurn", () => {
    const manager = new DebuggerContextManager();

    test("records a fix attempt against the original error", () => {
        const context = debuggerContext();
        const next = manager.appendTurn(context, { action: "editFile" }, { message: "added the import" });

        expect(next.fixHistory).toEqual([
            { error: context.originalError, fixSummary: "editFile: added the import" },
        ]);
        expect(next.recentTurns).toHaveLength(1);
        expect(context.fixHistory).toEqual([]);
    });

    test("prefers message, then summary, then truncated JSON for the fix summary", () => {
        const summaryOf = (toolRes: Record<string, unknown>) =>
            manager.appendTurn(debuggerContext(), { action: "act" }, toolRes).fixHistory[0]!.fixSummary;

        expect(summaryOf({ message: "m", summary: "s" })).toBe("act: m");
        expect(summaryOf({ summary: "s" })).toBe("act: s");
        expect(summaryOf({ code: 2 })).toBe('act: {"code":2}');
    });

    test("truncates a long JSON fix summary to 500 characters", () => {
        const fixSummary = manager.appendTurn(debuggerContext(), { action: "act" }, {
            stdout: "x".repeat(2000),
        }).fixHistory[0]!.fixSummary;

        expect(fixSummary.startsWith("act: ")).toBe(true);
        expect(fixSummary.length).toBe("act: ".length + 500);
    });

    test("appends to existing fix history without dropping earlier attempts", () => {
        const context = debuggerContext({
            fixHistory: [{ error: "old error", fixSummary: "first try" }],
        });
        const next = manager.appendTurn(context, { action: "act" }, { message: "second try" });

        expect(next.fixHistory.map((f) => f.fixSummary)).toEqual(["first try", "act: second try"]);
    });

    test("keeps only the most recent RECENT_TURNS_LIMIT turns", () => {
        const existing = Array.from({ length: RECENT_TURNS_LIMIT + 5 }, (_, i) => turn(i));
        const next = manager.appendTurn(debuggerContext({ recentTurns: existing }), { action: "act" }, {
            response: "newest",
        });

        expect(next.recentTurns).toHaveLength(RECENT_TURNS_LIMIT);
        expect(next.recentTurns.at(-1)!.content).toBe("act -> newest");
    });
});

describe("DebuggerContextManager.CompactContext", () => {
    const manager = new DebuggerContextManager();

    test("compacts the older half of the fix history and keeps the recent half", async () => {
        const fixHistory = Array.from({ length: 4 }, (_, i) => ({
            error: `error ${i}`,
            fixSummary: `fix ${i}`,
        }));
        const context = debuggerContext({ fixHistory });

        const compacted = await manager.CompactContext(context);

        expect((bamlCalls[0]!.context as DebuggerContext).fixHistory).toEqual(fixHistory.slice(0, 2));
        expect(compacted.fixHistory).toEqual([
            { error: context.originalError, fixSummary: "compacted fixes" },
            ...fixHistory.slice(2),
        ]);
        expect(compacted.originalError).toBe(context.originalError);
        expect(compacted.repoTree).toBe(context.repoTree);
    });

    test("SummarizeContext hands the whole context to the model", async () => {
        const summarized = await manager.SummarizeContext(debuggerContext());

        expect(bamlCalls.map((c) => c.name)).toEqual(["SummarizeDebuggerContext"]);
        expect(summarized.originalError).toBe("summarized error");
    });

    test("IsolateContext and OffLoadContext are still stubs", async () => {
        expect(await manager.IsolateContext()).toBe("TODO: implement this");
        expect(await manager.OffLoadContext()).toBe("TODO: implement this");
    });
});
