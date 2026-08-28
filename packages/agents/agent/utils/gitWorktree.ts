import type { E2BSandbox } from "./sandbox"
import { PROJECT_ROOT, SANDBOX_HOME } from "../config/systemConfig"

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

    async merge(sandbox: E2BSandbox, taskId: number): Promise<{ success: boolean, content: string, files: string[] }> {
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
            command: `git -C ${PROJECT_ROOT} merge --no-edit task-${taskId} || (git -C ${PROJECT_ROOT} merge --abort; exit 1)`,
        })
        if (!merge.success) {
            return { success: false, content: merge.content, files: [] }
        }
        const cleanup = await sandbox.Execute(sandbox.sandboxId, {
            action: 'runCommand',
            command: `git -C ${PROJECT_ROOT} worktree remove -f ${path}`,
        })
        return { success: true, content: cleanup.content, files }
    }
}
