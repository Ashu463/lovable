import type { FileEditOp } from "../../baml_client"

export type EditOutcome =
    | { ok: true; content: string }
    | { ok: false; reason: string }
// WRITTEN BY CLAUDE - will fix this by 9 aug 2026
/**
 * Search/replace patching. Pure: hand it file content, get new content back.
 *
 * For each edit it tries three ways to locate oldString, stopping at the first
 * that finds exactly one place:
 *   1. exact substring
 *   2. line-by-line ignoring trailing whitespace
 *   3. line-by-line ignoring indentation too (then re-indents the replacement)
 *
 * Anything ambiguous or unfound is rejected — there is no fuzzy matching,
 * because an edit applied to the wrong place is worse than one refused.
 * The batch is all-or-nothing: the caller writes only on ok, so a failed edit
 * can never leave a half-modified file behind.
 */
export function applyEdits(content: string, edits: FileEditOp[]): EditOutcome {
    if (edits.length === 0) return { ok: false, reason: "no edits supplied" }

    let next = content

    for (let i = 0; i < edits.length; i++) {
        const { oldString, newString } = edits[i]!
        const label = `edit ${i + 1} of ${edits.length}`
        const tooMany = (n: number) =>
            `${label}: oldString matched ${n} times. Include more surrounding lines so it identifies exactly one location` +
            (n > 5 ? ", or use writeFile to replace the whole file if this many duplicates means the file itself is malformed." : ".")

        if (!oldString) return { ok: false, reason: `${label}: oldString is empty, which would match everywhere` }

        // --- 1. exact substring ---
        const exact = next.split(oldString).length - 1
        if (exact > 1) return { ok: false, reason: tooMany(exact) }

        if (exact === 1) {
            const at = next.indexOf(oldString)
            const indent = /^[ \t]*/.exec(next.slice(next.lastIndexOf("\n", at - 1) + 1, at))![0]!
            const replacement = newString.split("\n")
                .map((line, n) => (n === 0 || !line.trim() || line.startsWith(indent)) ? line : indent + line)
                .join("\n")

            next = next.replace(oldString, replacement)
            continue
        }

        // --- 2 & 3. line windows, loosening what we ignore each pass ---
        const lines = next.split("\n")
        const oldLines = oldString.split("\n")
        const passes = [(l: string) => l.trimEnd(), (l: string) => l.trim()]

        let starts: number[] = []
        let pass = -1
        for (let p = 0; p < passes.length && starts.length === 0; p++) {
            const normalise = passes[p]!
            const target = oldLines.map(normalise)
            for (let k = 0; k + target.length <= lines.length; k++) {
                if (target.every((t, j) => normalise(lines[k + j]!) === t)) starts.push(k)
            }
            pass = p
        }

        if (starts.length === 0) {
            // Quote the closest line back, so the model can see how what it sent
            // differs from the file (usually escaping or class/className) rather
            // than re-guessing the same string.
            // Strip backslashes and quotes first: the usual cause of a miss is the
            // model sending class=\"x\" for a file containing class="x", so probing
            // with the raw text would find nothing and explain nothing.
            const probe = (oldLines.find(l => l.trim()) ?? "").replace(/[\\"']/g, " ")
            const token = probe.split(/[\s<>=]+/).filter(t => t.length > 3).sort((a, b) => b.length - a.length)[0] ?? ""
            const near = token ? lines.filter(l => l.replace(/[\\"']/g, " ").includes(token)).slice(0, 3) : []
            const hint = near.length
                ? ` Closest line(s) actually in the file:\n${near.join("\n")}`
                : " No line in the file contains that text — check whether you are editing the right file."

            return { ok: false, reason: `${label}: oldString not found. Copy it verbatim from the file, unescaped.${hint}` }
        }
        if (starts.length > 1) return { ok: false, reason: tooMany(starts.length) }

        const start = starts[0]!
        let replacement = newString

        if (pass === 1) {
            // Matched only by ignoring indentation, so shift the replacement from the
            // depth the model assumed onto the depth the file actually uses. `assumed`
            // is the shallowest indent across oldString's non-blank lines.
            const filled = oldLines.filter(l => l.trim())
            let assumed = /^[ \t]*/.exec(filled[0] ?? "")![0]!
            for (const line of filled) {
                const current = /^[ \t]*/.exec(line)![0]!
                while (assumed && !current.startsWith(assumed)) assumed = assumed.slice(0, -1)
            }

            const actual = /^[ \t]*/.exec(lines[start]!)![0]!
            replacement = newString.split("\n")
                .map(line => !line.trim() ? line : actual + (line.startsWith(assumed) ? line.slice(assumed.length) : line.trimStart()))
                .join("\n")
        }

        next = [
            ...lines.slice(0, start),
            ...replacement.split("\n"),
            ...lines.slice(start + oldLines.length),
        ].join("\n")
    }

    return { ok: true, content: next }
}
