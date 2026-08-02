// Contract tests for the search/replace edit tool. Pure function — no sandbox,
// no LLM, no network.
//
//   bun test packages/agents/agent/tools/edit.test.ts

import { test, expect } from "bun:test";
import { applyEdits } from "./edit";

const FILE = [
    "import { useState } from 'react'",
    "",
    "export function Counter() {",
    "    const [count, setCount] = useState(0)",
    "    return <button onClick={() => setCount(count + 1)}>{count}</button>",
    "}",
].join("\n");

test("applies a single exact edit", async () => {
    const out = applyEdits(FILE, [{ oldString: "useState(0)", newString: "useState(1000000000)" }]);
    expect(out.ok).toBe(true);
    if (out.ok) {
        expect(out.content).toContain("useState(1000000000)");
        expect(out.content).not.toContain("useState(0)");
        // everything else is untouched
        expect(out.content.split("\n").length).toBe(FILE.split("\n").length);
    }
});

test("applies several edits in order, each seeing the previous result", async () => {
    const out = applyEdits(FILE, [
        { oldString: "Counter", newString: "Tally" },
        { oldString: "Tally()", newString: "Tally({ start = 0 })" },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.content).toContain("export function Tally({ start = 0 })");
});

test("an empty newString deletes the matched region", async () => {
    const out = applyEdits(FILE, [{ oldString: "import { useState } from 'react'\n", newString: "" }]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.content.startsWith("\nexport function")).toBe(true);
});

test("a missing oldString fails with guidance, and does not guess", async () => {
    const out = applyEdits(FILE, [{ oldString: "useReducer(0)", newString: "x" }]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
        expect(out.reason).toContain("not found");
        expect(out.reason).toContain("copy the text exactly");
    }
});

test("an ambiguous oldString fails and names the count", async () => {
    const dupes = "const a = 1\nconst a = 1\n";
    const out = applyEdits(dupes, [{ oldString: "const a = 1", newString: "const a = 2" }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("matched 2 times");
});

test("an empty oldString is rejected rather than matching everywhere", async () => {
    const out = applyEdits(FILE, [{ oldString: "", newString: "junk" }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("empty");
});

test("tolerates trailing-whitespace drift in oldString", async () => {
    const out = applyEdits(FILE, [{
        oldString: "export function Counter() {   ",   // stray trailing spaces
        newString: "export function Counter() {",
    }]);
    expect(out.ok).toBe(true);
});

test("tolerates wrong indentation and re-indents to what the file actually uses", async () => {
    // model quotes the body unindented, and supplies an unindented replacement
    const out = applyEdits(FILE, [{
        oldString: "const [count, setCount] = useState(0)",
        newString: "const [count, setCount] = useState(0)\nconst [step, setStep] = useState(1)",
    }]);
    expect(out.ok).toBe(true);
    if (out.ok) {
        // both lines land at the file's real 4-space depth
        expect(out.content).toContain("    const [count, setCount] = useState(0)");
        expect(out.content).toContain("    const [step, setStep] = useState(1)");
        expect(out.content).not.toContain("\nconst [step");
    }
});

test("a failing edit in a batch aborts the whole batch, naming which one", async () => {
    const out = applyEdits(FILE, [
        { oldString: "useState(0)", newString: "useState(5)" },
        { oldString: "NOT_PRESENT", newString: "x" },
    ]);
    expect(out.ok).toBe(false);
    // caller writes only on ok, so the earlier edit is never persisted
    if (!out.ok) expect(out.reason).toContain("edit 2 of 2");
});

test("an empty edit list is rejected", async () => {
    const out = applyEdits(FILE, []);
    expect(out.ok).toBe(false);
});
