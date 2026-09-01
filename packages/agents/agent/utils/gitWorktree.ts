import type { E2BSandbox } from "./sandbox"
import { PROJECT_ROOT, SANDBOX_HOME } from "../config/systemConfig"
import { b, type MergeConflictResolution } from "../../baml_client"
import { MERGE_CONFLICT_RESOLVER_PROMPT } from "../config/systemPrompts"

type TaskInfo = { taskId: number, task: string, summary: string }

const UNMERGED_CODES = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']
const HANDLED_CODES = ['UU', 'AA', 'DU', 'UD']

export class WorktreeGit {

    async ensureRepo(sandbox: E2BSandbox): Promise<void> {
        const check = await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `test -d ${PROJECT_ROOT}/.git && echo yes || echo no` })
        if (check.content.includes('no')) {
            await sandbox.Execute(sandbox.sandboxId, {
                action: 'runCommand',
                command: `git init -q && git add -A && git -c user.email=agent@lovable.dev -c user.name=lovable-agent commit -q -m "bootstrap" --allow-empty`,
            })
        }
    }

    async create(sandbox: E2BSandbox, taskId: number): Promise<string> {
        const path = `${SANDBOX_HOME}/worktrees/task-${taskId}`
        await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} worktree add -q ${path} -b task-${taskId} && ln -s ${PROJECT_ROOT}/node_modules ${path}/node_modules`,
        })
        return path
    }

    async merge(
        sandbox: E2BSandbox,
        taskId: number,
        current: { task: string, summary: string },
        siblings: TaskInfo[],
        siblingFiles: Record<number, string[]>,
    ): Promise<{ success: boolean, content: string, files: string[] }> {
        const path = `${SANDBOX_HOME}/worktrees/task-${taskId}`

        const commit = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${path} add -A && git -c user.email=agent@lovable.dev -c user.name=lovable-agent -C ${path} commit -q --allow-empty -m "task-${taskId}"`,
        })
        if (!commit.success) {
            return { success: false, content: `Failed to commit task ${taskId}'s worktree changes: ${commit.content}`, files: [] }
        }

        const diff = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} diff --name-only HEAD task-${taskId}`,
        })
        const files = diff.content.split('\n').map(f => f.trim()).filter(Boolean)

        const merge = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} merge --no-edit task-${taskId}`,
        })
        if (merge.success) {
            const cleanup = await sandbox.Execute(sandbox.sandboxId, {
                action: 'runCommand',
                command: `git -C ${PROJECT_ROOT} worktree remove -f ${path}`,
            })
            return { success: true, content: cleanup.content, files }
        }

        return await this.handleConflict(sandbox, taskId, path, files, current, siblings, siblingFiles, merge.content)
    }

    private async abort(sandbox: E2BSandbox, reason: string): Promise<{ success: false, content: string, files: never[] }> {
        await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `git -C ${PROJECT_ROOT} merge --abort` })
        return { success: false, content: reason, files: [] }
    }

    private async handleConflict(
        sandbox: E2BSandbox, taskId: number, worktreePath: string, files: string[],
        current: { task: string, summary: string }, siblings: TaskInfo[], siblingFiles: Record<number, string[]>,
        mergeFailureOutput: string,
    ): Promise<{ success: boolean, content: string, files: string[] }> {
        const status = await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `git -C ${PROJECT_ROOT} status --porcelain` })
        const conflicts = status.content.split('\n')
            .map(l => l.trim())
            .filter(Boolean)
            .map(l => ({ code: l.slice(0, 2), file: l.slice(3) }))
            .filter(l => UNMERGED_CODES.includes(l.code))

        // No unmerged paths at all means the merge failed for some other
        // reason (disk/permissions/corrupted git state) — not a conflict.
        // TODO: out of scope for now, just abort with the raw error. Worth
        // revisiting if this turns out to be common in practice (retry, or
        // a diagnostic LLM call to interpret the git error itself).
        if (conflicts.length === 0) {
            return await this.abort(sandbox, mergeFailureOutput)
        }

        const unhandled = conflicts.filter(c => !HANDLED_CODES.includes(c.code))
        // DD (both deleted) and AU/UA (asymmetric add, usually rename-
        // detection) aren't framed for the resolver yet — different shape
        // per code, not just "markers in a file."
        // TODO: rare given how the planner scopes tasks to disjoint files,
        // but worth adding a dedicated framing per code if they show up.
        if (unhandled.length > 0) {
            return await this.abort(sandbox, `Conflict type(s) not yet supported by the resolver: ${unhandled.map(c => `${c.code} ${c.file}`).join(', ')}`)
        }

        const resolvedFiles: string[] = []
        for (const { code, file } of conflicts) {
            const resolution = await this.resolveConflictFile(sandbox, taskId, code, file, current, siblings, siblingFiles)
            if (!resolution.resolved) {
                return await this.abort(sandbox, `Conflict on ${file} could not be auto-resolved: ${resolution.reason}`)
            }
            resolvedFiles.push(file)
        }

        const commitMerge = await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `git -C ${PROJECT_ROOT} commit --no-edit -q` })
        if (!commitMerge.success) {
            return await this.abort(sandbox, `Resolved all conflicts but failed to finalize the merge commit: ${commitMerge.content}`)
        }

        const cleanup = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} worktree remove -f ${worktreePath}`,
        })
        return { success: true, content: `${cleanup.content} (auto-resolved conflict in: ${resolvedFiles.join(', ')})`, files }
    }

    private async resolveConflictFile(
        sandbox: E2BSandbox, taskId: number, code: string, file: string,
        current: { task: string, summary: string }, siblings: TaskInfo[], siblingFiles: Record<number, string[]>,
    ): Promise<{ resolved: boolean, reason: string }> {
        // Binary files can't be text-merged by an LLM — not in scope, fail fast.
        // TODO: binary conflicts (images etc.) are unresolved on purpose for now 
        const numstat = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} diff --numstat HEAD task-${taskId} -- '${file}'`,
        })
        if (numstat.content.trim().startsWith('-\t-')) {
            return { resolved: false, reason: `${file} is a binary file — not eligible for automatic conflict resolution` }
        }

        let conflictKind: "content" | "deletedByTrunk" | "deletedByTask"
        let conflictText: string
        if (code === 'DU') {
            conflictKind = "deletedByTrunk"
            conflictText = (await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `git -C ${PROJECT_ROOT} show task-${taskId}:'${file}'` })).content
        } else if (code === 'UD') {
            conflictKind = "deletedByTask"
            conflictText = (await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `git -C ${PROJECT_ROOT} show HEAD:'${file}'` })).content
        } else {
            conflictKind = "content"
            conflictText = (await sandbox.Execute(sandbox.sandboxId, { action: 'read', path: file }, PROJECT_ROOT)).content
        }

        const ownerTaskId = Object.entries(siblingFiles).find(([, fs]) => fs.includes(file))?.[0]
        const trunkTask = ownerTaskId ? siblings.find(s => s.taskId === Number(ownerTaskId)) : undefined

        let resolution: MergeConflictResolution
        try {
            resolution = await b.ResolveMergeConflict(MERGE_CONFLICT_RESOLVER_PROMPT, {
                filePath: file,
                conflictKind,
                conflictText,
                currentTask: { task: current.task, summary: current.summary },
                trunkTask: trunkTask ? { task: trunkTask.task, summary: trunkTask.summary } : undefined,
            })
        } catch (e) {
            return { resolved: false, reason: `ResolveMergeConflict call failed: ${e instanceof Error ? e.message : String(e)}` }
        }

        if (!resolution.resolved) {
            return { resolved: false, reason: resolution.reason }
        }

        if (resolution.content == null) {
            await sandbox.Execute(sandbox.sandboxId, { action: 'delete', path: file }, PROJECT_ROOT)
        } else {
            await sandbox.Execute(sandbox.sandboxId, { action: 'writeFile', path: file, content: resolution.content }, PROJECT_ROOT)
        }
        await sandbox.Execute(sandbox.sandboxId, { action: 'runCommand', command: `git -C ${PROJECT_ROOT} add -- '${file}'` })

        return { resolved: true, reason: resolution.reason }
    }
}
