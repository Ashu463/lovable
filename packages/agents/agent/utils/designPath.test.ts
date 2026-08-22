import { test, expect } from "bun:test";
import { slugify, designFilePath } from "./designPath";

test("slugify lowercases, hyphenates, and strips non-alphanumerics", () => {
    expect(slugify("Build the Dashboard Screen!")).toBe("build-the-dashboard-screen");
});

test("slugify truncates to maxLen and trims trailing hyphens", () => {
    expect(slugify("a very very very long screen name indeed", 10)).toBe("a-very-ver");
});

test("slugify falls back to 'screen' for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("screen");
});

test("designFilePath builds the sandbox-relative design path", () => {
    expect(designFilePath(12, "Dashboard")).toBe("design/12-dashboard.html");
});
