import { CommandExitError, Sandbox, SandboxNotFoundError } from 'e2b'
import type { DeleteFile, EditFile, ReadFile, RunCommand, WriteFile } from '../../baml_client';
import { R2 } from '../services/file-storage/fileStorage';
import { SANDBOX_HOME, PROJECT_ROOT, RUN_COMMAND_TIMEOUT_MS, SANDBOX_TIMEOUT_MS, PREVIEW_PORT, PREVIEW_START_ATTEMPTS, MAX_BOOT_WAIT_MS, POLL_INTERVAL_MS, SANDBOX_KEEPALIVE_INTERVAL_MS, REPO_TREE_PRUNE_DIRS, REPO_TREE_MAX_ENTRIES, SYNC_R2_TIMEOUT_MS } from '../config/systemConfig';
import { logger } from './logger';
import { applyEdits } from '../tools/edit';

function sandboxIsGone(e: unknown): boolean {
    if(e instanceof SandboxNotFoundError) return true
    const message = e instanceof Error ? e.message : String(e)
    return /sandbox was not found|not running|sandbox timeout/i.test(message)
}

export interface ExecuteRes{
    success: boolean,
    content: string,
    stdout?: string,
    stderr?: string
}
export class E2BSandbox{
    private userId: string
    private projectId: string
    private sandbox: Sandbox
    private lastKeepAlive: number
    private recovering: Promise<void> | null = null
    r2 = new R2()
    private constructor(sandbox: Sandbox, userId: string, projectId: string){
        this.sandbox = sandbox
        this.userId = userId
        this.projectId = projectId
        this.lastKeepAlive = Date.now()
    }
    get sandboxId(): string{
        return this.sandbox.sandboxId
    }

    async Connect(id: string){
        const sandbox = await Sandbox.connect(id)
        await sandbox.setTimeout(SANDBOX_TIMEOUT_MS)
        return sandbox
    }
    // Keyed by (userId, projectId): every StartSandbox call for the same
    // project reconnects to the same underlying E2B sandbox and restores the
    // exact same R2 files into the exact same PROJECT_ROOT — a parallel level
    // calls this once for itself plus once per task (Orchestrator.runLevel),
    // so a 3-task level fired 4 independent restores of the same file set.
    // The in-flight PROMISE is cached, not a "restored N seconds ago"
    // timestamp — callers in the same Promise.all fire near-simultaneously,
    // so a timestamp check would still let all of them race past it before
    // any one finished. Callers still each get their own E2BSandbox instance
    // (safe for concurrent independent use, e.g. separate worktrees); only
    // the restore's R2 round-trips are deduplicated.
    private static restoreInFlight = new Map<string, Promise<void>>()

    private static knownGoodSandboxIds = new Set<string>()

    static async StartSandbox(userId: string, projectId: string, sandboxId?: string): Promise<E2BSandbox> {
        let sandbox: Sandbox | null = null
        // r2 -> sandbox.

        if (sandboxId) {
            try {
                sandbox = await Sandbox.connect(sandboxId)
                await sandbox.setTimeout(SANDBOX_TIMEOUT_MS)
            } catch (e) {
                 logger.warn(`Could not reconnect to sandbox ${sandboxId} (${e instanceof Error ? e.message : String(e)}) — creating a REPLACEMENT sandbox. Callers must adopt the new id.`)
                sandbox = null
            }
        }

        if (!sandbox) {
            sandbox = await Sandbox.create('react-sandbox-node22', { timeoutMs: SANDBOX_TIMEOUT_MS })
            logger.warn(`Created replacement sandbox ${sandbox.sandboxId}${sandboxId ? ` (was ${sandboxId})` : ''}`)
        }

        const instance = new E2BSandbox(sandbox, userId, projectId)

        const key = `${userId}:${projectId}`
        let restore = E2BSandbox.restoreInFlight.get(key)
        if (!restore) {
            restore = instance.restoreOrBootstrap()
            E2BSandbox.restoreInFlight.set(key, restore)
            // Only the entry THIS call created should be cleared, and only
            // once it settles — a slower restore finishing after a newer one
            // started would otherwise clear the newer (still in-flight) entry.
            restore.finally(() => {
                if (E2BSandbox.restoreInFlight.get(key) === restore) {
                    E2BSandbox.restoreInFlight.delete(key)
                }
            })
        }
        await restore
        return instance
    }
    private async restoreOrBootstrap(): Promise<void> {
        if (E2BSandbox.knownGoodSandboxIds.has(this.sandboxId)) {
            logger.info(`Sandbox ${this.sandboxId} already in sync with R2, skipping restore`)
            return
        }

        const files = await this.r2.listFiles(this.r2.filesPrefix(this.userId, this.projectId))

        if (files.length > 0) {
            logger.info(`Restoring ${files.length} files from R2`)
            for (const key of files) {
                const relativePath = key.replace(this.r2.filesPrefix(this.userId, this.projectId), '')
                const content = await this.r2.getFile(key)
                await this.sandbox.files.write(`${SANDBOX_HOME}${relativePath}`, content)
            }
            const hasDeps = await this.sandbox.commands.run(
                `test -d ${PROJECT_ROOT}/node_modules && echo yes || echo no`
            )
            if(hasDeps.stdout.trim() === 'no'){
                logger.info('node_modules missing after restore, installing dependencies')
                const install = await this.sandbox.commands.run('npm install', {
                    cwd: PROJECT_ROOT,
                    timeoutMs: RUN_COMMAND_TIMEOUT_MS
                })
                if(install.exitCode !== 0){
                    logger.error(`npm install after restore failed: ${install.stderr}`)
                }
            }

            await this.ensureGitRepo()
            E2BSandbox.knownGoodSandboxIds.add(this.sandboxId)
            logger.info('Restore complete')
        } else {
            logger.info('Bootstrapping fresh sandbox')

            await this.sandbox.commands.run(`mkdir -p ${PROJECT_ROOT}`)

            await this.sandbox.commands.run(
                'curl -fsSL https://codeload.github.com/Ashu463/react-template/tar.gz/refs/heads/master -o repo.tar.gz',
                { cwd: PROJECT_ROOT }
            )

            await this.sandbox.commands.run(
                'tar -xzf repo.tar.gz --strip-components=1 && rm repo.tar.gz',
                { cwd: PROJECT_ROOT }
            )

            const install = await this.sandbox.commands.run('npm install', { cwd: PROJECT_ROOT })
            if (install.exitCode !== 0) {
                logger.error(`npm install failed: ${install.stderr}`)
                throw new Error('Bootstrap failed: npm install did not succeed')
            }

            await this.ensureGitRepo()
            logger.info(`Bootstrap complete, sandboxId: ${this.sandboxId}`)

            await this.SyncR2()
        }

    }

    private async ensureGitRepo(): Promise<void> {
        const check = await this.sandbox.commands.run(`test -d ${PROJECT_ROOT}/.git && echo yes || echo no`)
        if (check.stdout.trim() === 'yes') return

        logger.info(`No .git at ${PROJECT_ROOT} after restore — initializing repo`)
        await this.sandbox.commands.run(
            `git init -q && git config user.email agent@lovable.dev && git config user.name lovable-agent && git add -A && git commit -q -m "restored from R2" --allow-empty`,
            { cwd: PROJECT_ROOT, timeoutMs: RUN_COMMAND_TIMEOUT_MS },
        )
    }

    private resolvePath(path: string, baseDir: string): string {
        if (path.startsWith('/')) return path
        return `${baseDir}/${path.replace(/^\.\//, '')}`
    }

    async EnsureAlive(): Promise<boolean> {
        try{
            await this.sandbox.commands.run('true')
            return false
        }
        catch(e){
            if(!sandboxIsGone(e)) throw e
            await this.replaceSandbox()
            return true
        }
    }

    private async replaceSandbox(): Promise<void> {
        const lost = this.sandbox.sandboxId
        logger.warn(`Sandbox ${lost} is gone, replacing it and restoring from R2`)
        // Shared promise so concurrent callers wait on one replacement, not several.
        this.recovering ??= (async () => {
            this.sandbox = await Sandbox.create('react-sandbox-node22', { timeoutMs: SANDBOX_TIMEOUT_MS })
            this.lastKeepAlive = Date.now()
            await this.restoreOrBootstrap()
            logger.info(`Recovered onto sandbox ${this.sandboxId} (was ${lost})`)
        })()
        try { await this.recovering } finally { this.recovering = null }
    }

    private toolFailure(action: string, path: string, reason: string): ExecuteRes {
        logger.error(`Failed to ${action} ${path}: ${reason}`)
        if (sandboxIsGone(reason)) throw new Error(`Sandbox unavailable: ${reason}`)
        return {
            success: false,
            content: `Failed to ${action} ${path}: ${reason}`
        }
    }

    async getRepoTree(baseDir: string = PROJECT_ROOT): Promise<string>{
        const prunes = [...REPO_TREE_PRUNE_DIRS.map(d => `-name '${d}'`), `-name '@*'`].join(' -o ')
        try{
            const result = await this.sandbox.commands.run(
                `find . \\( ${prunes} \\) -prune -o -type f -not -name '.env' -print`,
                { cwd: baseDir }
            )

            const entries = result.stdout.split('\n').map(l => l.trim()).filter(Boolean)
            if(entries.length <= REPO_TREE_MAX_ENTRIES) return entries.join('\n')

            logger.warn(`repoTree has ${entries.length} entries, truncating to ${REPO_TREE_MAX_ENTRIES} — likely dependency spill in the project root`)
            return [
                ...entries.slice(0, REPO_TREE_MAX_ENTRIES),
                `... [${entries.length - REPO_TREE_MAX_ENTRIES} more files omitted; use RunCommand with find/ls to explore a specific directory]`
            ].join('\n')
        }
        catch(e){
            logger.error(`Failed to generate repo tree: ${e}`)
            throw new Error(`Error occurred while generating repository tree`)
        }
    }
    
    async Execute(id: string, payload: ReadFile | WriteFile | EditFile | DeleteFile| RunCommand, baseDir: string = PROJECT_ROOT, retried = false): Promise<ExecuteRes>{
        try{

            // Refresh the sandbox TTL at most once per interval, not on every call.
            if(Date.now() - this.lastKeepAlive >= SANDBOX_KEEPALIVE_INTERVAL_MS){
                this.lastKeepAlive = Date.now()
                await this.sandbox.setTimeout(SANDBOX_TIMEOUT_MS).catch(e => logger.warn(`Failed to refresh sandbox timeout: ${e}`))
            }

            if(payload.action === 'read'){
                const path = this.resolvePath(payload.path, baseDir)
                try{
                    const result: string = await this.sandbox.files.read(path)
                    return {
                        success: true,
                        content: result
                    }
                }
                catch(e){
                    return this.toolFailure('read', path, e instanceof Error ? e.message : String(e))
                }
            }
            else if(payload.action === 'writeFile'){
                const path = this.resolvePath(payload.path, baseDir)
                try{
                    const writeRes = await this.sandbox.files.write(path, payload.content)

                    return {
                        success: true,
                        content: `Content written at ${writeRes.path}`
                    }
                }
                catch(e){
                    return this.toolFailure('write', path, e instanceof Error ? e.message : String(e))
                }
            }
            else if(payload.action === 'editFile'){
                const path = this.resolvePath(payload.path, baseDir)
                try{
                    const current: string = await this.sandbox.files.read(path)
                    const edited = applyEdits(current, payload.edits)
                    if(edited.ok === false) return this.toolFailure('edit', path, edited.reason)

                    await this.sandbox.files.write(path, edited.content)
                    return {
                        success: true,
                        content: `Applied ${payload.edits.length} edit(s) to ${path}`
                    }
                }
                catch(e){
                    return this.toolFailure('edit', path, e instanceof Error ? e.message : String(e))
                }
            }
            else if(payload.action === 'delete'){
                const path = this.resolvePath(payload.path, baseDir)
                try{
                    const deleteRes = await this.sandbox.files.remove(path)

                    return {
                        success: true,
                        content: `Deleted file is ${deleteRes}`
                    }
                }
                catch(e){
                    return this.toolFailure('delete', path, e instanceof Error ? e.message : String(e))
                }
            }
            else if(payload.action === 'runCommand'){
                const cwd = payload.cwd ? this.resolvePath(payload.cwd, baseDir) : baseDir
                try{
                    if (/^\s*npm\s+(install|i)(\s|$)/.test(payload.command) && cwd.includes('/worktrees/task-')) {
                        await this.sandbox.commands.run(
                            `if [ -L node_modules ]; then rm node_modules && cp -al ${PROJECT_ROOT}/node_modules node_modules; fi`,
                            { cwd, timeoutMs: RUN_COMMAND_TIMEOUT_MS }
                        ).then(() => logger.info(`De-symlinked node_modules before install (${cwd})`))
                         .catch((e) => logger.warn(`Failed to de-symlink node_modules before install in ${cwd}, proceeding anyway: ${e}`))
                    }

                    const cmdRes = await this.sandbox.commands.run(payload.command, {
                        cwd,
                        timeoutMs: RUN_COMMAND_TIMEOUT_MS
                    })
                    return {
                        success: true,
                        content: cmdRes.stderr + cmdRes.stdout,
                        stderr: cmdRes.stderr,
                        stdout: cmdRes.stdout
                    }
                }
                catch(e){
                    if(e instanceof CommandExitError){
                        logger.error(`Command "${payload.command}" (cwd: ${cwd}) exited ${e.exitCode}: ${e.stderr || e.stdout}`)
                        return {
                            success: false,
                            content: e.stderr || e.stdout || e.error || `Command exited with code ${e.exitCode}`,
                            stdout: e.stdout,
                            stderr: e.stderr
                        }
                    }
                    return this.toolFailure('run command', `"${payload.command}" (cwd: ${cwd})`, e instanceof Error ? e.message : String(e))
                }
            }
            return {
                success: false,
                content: "Unknown error occurred"
            }

        }
        catch(e){
            if(retried || !sandboxIsGone(e)) throw e

            await this.replaceSandbox()
            return this.Execute(id, payload, baseDir, true)
        }
    }

     /* Steps: 
        - if any s3id exists corresponding to this user id and this session id
            then load the code from the s3's that directory itself.
        - else run npm create-vite@latest and return the current tree of the code. 
        */

    async SyncR2(){
        const start = Date.now()
        logger.info(`SyncR2 starting for sandbox ${this.sandboxId}`)
        try {
            await this.doSyncR2WithTimeout()
            E2BSandbox.knownGoodSandboxIds.add(this.sandboxId)
            logger.info(`SyncR2 complete for sandbox ${this.sandboxId} (${Date.now() - start}ms)`)
        } catch (e) {
            logger.error(`SyncR2 failed for sandbox ${this.sandboxId} after ${Date.now() - start}ms: ${e instanceof Error ? e.message : String(e)}`)
            throw e
        }
    }

    private async doSyncR2WithTimeout(): Promise<void> {
        let timer: ReturnType<typeof setTimeout>
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`SyncR2 exceeded ${SYNC_R2_TIMEOUT_MS}ms`)), SYNC_R2_TIMEOUT_MS)
        })
        try {
            await Promise.race([this.doSyncR2(), timeout])
        } finally {
            clearTimeout(timer!)
        }
    }

    private async doSyncR2(): Promise<void> {
        const prefix = this.r2.filesPrefix(this.userId, this.projectId)
        const prunes = [...REPO_TREE_PRUNE_DIRS.map(d => `-name '${d}'`), `-name '@*'`, `-name '.npm'`].join(' -o ')
        const findCmd = `find ${PROJECT_ROOT} \\( ${prunes} \\) -prune -o -type f -not -name '.env' -not -name '.gitignore' -print`

        const result = await this.sandbox.commands.run(findCmd)

        const absolutePaths = result.stdout.split('\n')
            .map(p => p.trim())
            .filter(Boolean)

        for(let i = 0 ; i < absolutePaths.length; i += 10){
            const batch = absolutePaths.slice(i, i + 10)
            await Promise.all(batch.map(async (absPath) =>{
                const relPath = absPath.replace(SANDBOX_HOME, "")
                const content = await this.sandbox.files.read(absPath)
                await this.r2.putFile(prefix + relPath, content)
            }))
        }
    }

    // Probes with the public E2B hostname in the Host header, which is what the
    // browser's iframe actually sends. Probing plain localhost is misleading:
    // vite always allows localhost, so it answers 200 even while rejecting the
    // proxied host with a 403. Returns '000' when nothing is listening.
    private async probePreviewStatus(): Promise<string>{
        const probe = await this.sandbox.commands.run(
            `curl -s -o /dev/null -w '%{http_code}' -H 'Host: ${this.sandbox.getHost(PREVIEW_PORT)}' http://localhost:${PREVIEW_PORT} || true`,
            { cwd: PROJECT_ROOT }
        )
        return probe.stdout.trim()
    }

    // This is the last step before a human sees anything: every task can have
    // succeeded and the build passed, and a single transient failure here still
    // leaves the user with no app and the run unfinalized (observed 2026-09-20 —
    // a port race with the tester killed the server mid-boot, GetPreviewUrl threw
    // "signal: terminated", and ~20 minutes of green work surfaced as nothing).
    // Unlike the agents' own work, nothing upstream retries this, so it retries
    // itself rather than discarding a whole successful run on one blip.
    async GetPreviewUrl(): Promise<string>{
        const url = `https://${this.sandbox.getHost(PREVIEW_PORT)}`
        let lastError: unknown
        for (let attempt = 1; attempt <= PREVIEW_START_ATTEMPTS; attempt++) {
            try{
                // Clear any dev server still holding the port before binding it: a
                // previous run's, or a tester orphan (`npm run dev` spawns vite as a
                // CHILD, so killing the command leaves vite alive on the port).
                //
                // The pattern is bracketed on purpose. `[v]ite` is a regex matching
                // the string "vite", but this command's own command line literally
                // contains "[v]ite", which that regex does NOT match — so pkill
                // cannot kill the shell running it. A plain `pkill -f vite` DOES
                // match its own shell and SIGTERMs itself; `|| true` can't rescue
                // that because the shell is killed, not merely exiting non-zero.
                // It surfaced as "signal: terminated" thrown from this function,
                // which broke run finalization AND every project load (project.ts
                // calls GetPreviewUrl too) — sandbox healthy, app never appearing.
                await this.sandbox.commands.run(`pkill -f '[v]ite' 2>/dev/null || true`, { cwd: PROJECT_ROOT })

                // Let the OS release the port before --strictPort tries to bind it;
                // without this the fresh vite can fail outright on a still-closing socket.
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

                await this.sandbox.commands.run(
                    `npm run dev -- --host 0.0.0.0 --port ${PREVIEW_PORT} --strictPort`,
                    {
                        cwd: PROJECT_ROOT,
                        background: true,
                        envs: { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: '.e2b.app' }
                    }
                )

                const deadline = Date.now() + MAX_BOOT_WAIT_MS
                while(Date.now() < deadline){
                    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
                    const s = await this.probePreviewStatus()
                    if(s !== '' && s !== '000' && s !== '403') return url
                }

                throw new Error(`dev server did not start listening on port ${PREVIEW_PORT} within ${MAX_BOOT_WAIT_MS}ms`)
            }catch(e){
                lastError = e
                logger.error(`Preview server start failed (attempt ${attempt}/${PREVIEW_START_ATTEMPTS}): ${e instanceof Error ? e.message : String(e)}`)
            }
        }
        throw new Error(`Error occurred while starting the preview server after ${PREVIEW_START_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
    }
    Release(){
        this.sandbox.kill()
    }
}

/* -------------Discussion-------------------

Steps/flow I thought for sandboxes
Case - 1: Starting a new project from very scratch. 
- Sandbox will preloaded with the react init code
- coder agent recieves figma code, and will update files of this boilerPlate 
    accordingly note that coder agent will have tool to read and see what the 
    project structure is inside the sandbox. 

- that update files will be written in the sanbox, maybe in batches or simply
    one file at a time.

Case - 2: Sandbox died and now have to perfom certain ops
- Spin up a new sandbox
- connect to that sanbox via it's id
- pull the code from file storage
- and then execute whateger ops needed.

Notes: 
- sandbox TTL should be reset after every every ops execution(read, write, or so)
- 
Ops according to me: 
- create
- connect
- writeToSandbox
- read
- getProjectTree
- runCommand
- cloneCode
- writeFileStorage/Snapshotting the sandbox. 

About Deploy pipeline: 
- whenever sandbox's npm run dev shows the healthy check
    open up a new deploy pipeline. 

Steps: 
- npm run dev is healthy then, run the npm build and 
- send it to the vercel mcp server. 
*/

// -------------NEW FLOW-------------------
/*
- user prompts something 
- sandbox spawned with new session id
- then agent flow takes over
*/