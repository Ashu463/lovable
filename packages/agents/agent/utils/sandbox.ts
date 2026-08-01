import { CommandExitError, Sandbox } from 'e2b'
import type { DeleteFile, EditFile, ReadFile, RunCommand, WriteFile } from '../../baml_client';
import { R2 } from '../services/file-storage/fileStorage';
import { SANDBOX_HOME, PROJECT_ROOT, RUN_COMMAND_TIMEOUT_MS, SANDBOX_TIMEOUT_MS, PREVIEW_PORT, MAX_BOOT_WAIT_MS, POLL_INTERVAL_MS, SANDBOX_KEEPALIVE_INTERVAL_MS, REPO_TREE_PRUNE_DIRS, REPO_TREE_MAX_ENTRIES, R2_SYNC_INTERVAL_MS } from '../config/systemConfig';
import { logger } from './logger';

const SANDBOX_GONE = /sandbox was not found|sandbox is not running|sandbox timeout/i

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
    private lastR2Sync: number
    private recovering: Promise<void> | null = null
    r2 = new R2()
    private constructor(sandbox: Sandbox, userId: string, projectId: string){
        this.sandbox = sandbox
        this.userId = userId
        this.projectId = projectId
        this.lastKeepAlive = Date.now()
        this.lastR2Sync = Date.now()
    }
    get sandboxId(): string{
        return this.sandbox.sandboxId
    }

    async Connect(id: string){
        const sandbox = await Sandbox.connect(id)
        await sandbox.setTimeout(SANDBOX_TIMEOUT_MS)
        return sandbox
    }
    static async StartSandbox(userId: string, projectId: string, sandboxId?: string): Promise<E2BSandbox> {
        let sandbox: Sandbox | null = null
        // r2 -> sandbox.
        
        if (sandboxId) {
            try {
                sandbox = await Sandbox.connect(sandboxId)
                await sandbox.setTimeout(SANDBOX_TIMEOUT_MS)
            } catch (e) {
                sandbox = null
            }
        }

        if (!sandbox) {
            sandbox = await Sandbox.create('react-sandbox-node22', { timeoutMs: SANDBOX_TIMEOUT_MS })
        }

        const instance = new E2BSandbox(sandbox, userId, projectId)
        await instance.restoreOrBootstrap()
        return instance
    }
    private async restoreOrBootstrap(): Promise<void> {
        const files = await this.r2.listFiles(this.r2.filesPrefix(this.userId, this.projectId))

        if (files.length > 0) {
            logger.info(`Restoring ${files.length} files from R2`)
            this.lastR2Sync = Date.now()

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

            logger.info(`Bootstrap complete, sandboxId: ${this.sandboxId}`)

            await this.SyncR2(true)
        }

    }
    private resolvePath(path: string): string {
        if (path.startsWith('/')) return path
        return `${PROJECT_ROOT}/${path.replace(/^\.\//, '')}`
    }

    private toolFailure(action: string, path: string, reason: string): ExecuteRes {
        logger.error(`Failed to ${action} ${path}: ${reason}`)
        if (SANDBOX_GONE.test(reason)) throw new Error(`Sandbox unavailable: ${reason}`)
        return {
            success: false,
            content: `Failed to ${action} ${path}: ${reason}`
        }
    }

    async getRepoTree(): Promise<string>{
        const prunes = [...REPO_TREE_PRUNE_DIRS.map(d => `-name '${d}'`), `-name '@*'`].join(' -o ')
        try{
            const result = await this.sandbox.commands.run(
                `find . \\( ${prunes} \\) -prune -o -type f -not -name '.env' -print`,
                { cwd: PROJECT_ROOT }
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
    
    async Execute(id: string, payload: ReadFile | WriteFile | EditFile | DeleteFile| RunCommand, retried = false): Promise<ExecuteRes>{
        try{

            // Refresh the sandbox TTL at most once per interval, not on every call.
            if(Date.now() - this.lastKeepAlive >= SANDBOX_KEEPALIVE_INTERVAL_MS){
                this.lastKeepAlive = Date.now()
                await this.sandbox.setTimeout(SANDBOX_TIMEOUT_MS).catch(e => logger.warn(`Failed to refresh sandbox timeout: ${e}`))
            }

            if(payload.action === 'read'){
                const path = this.resolvePath(payload.path)
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
                const path = this.resolvePath(payload.path)
                try{
                    const writeRes = await this.sandbox.files.write(path, payload.content)
                    await this.SyncR2()

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
                throw new Error(`To be implemented don't call this please`)
            }
            else if(payload.action === 'delete'){
                const path = this.resolvePath(payload.path)
                try{
                    const deleteRes = await this.sandbox.files.remove(path)
                    await this.SyncR2()

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
                const cwd = payload.cwd ? this.resolvePath(payload.cwd) : PROJECT_ROOT
                try{
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
            const reason = e instanceof Error ? e.message : String(e)
            if(retried || !SANDBOX_GONE.test(reason)) throw e

            // E2B kills a sandbox at the plan's runtime cap (1h Hobby / 24h Pro).
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

            return this.Execute(id, payload, true)
        }
    }

     /* Steps: 
        - if any s3id exists corresponding to this user id and this session id
            then load the code from the s3's that directory itself.
        - else run npm create-vite@latest and return the current tree of the code. 
        */
    
    async SyncR2(force = false){
        if(!force && Date.now() - this.lastR2Sync < R2_SYNC_INTERVAL_MS) return
        this.lastR2Sync = Date.now()

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

    async GetPreviewUrl(): Promise<string>{
        const url = `https://${this.sandbox.getHost(PREVIEW_PORT)}`
        try{
            const status = await this.probePreviewStatus()
            if(status !== '' && status !== '000' && status !== '403') return url

            // A 403 means a dev server is up but was started without the
            // allowedHosts env var below (e.g. by the agent itself, or by an
            // earlier run) — it will never accept the proxied host, so replace it.
            if(status === '403'){
                logger.info('Dev server is rejecting the proxied host, restarting it with allowedHosts set')
                await this.sandbox.commands.run('pkill -f vite || true', { cwd: PROJECT_ROOT })
            }

            // --host is required because vite's default bind (127.0.0.1) is
            // unreachable through E2B's proxy. The env var is vite's own escape
            // hatch for proxied setups: without it server.allowedHosts answers
            // the E2B hostname with a 403 "This host is not allowed", which
            // renders as a blank preview. A leading dot allows all subdomains,
            // covering every sandbox id and port without editing vite.config.ts.
            // --strictPort so a leftover listener surfaces as a startup failure
            // instead of vite silently drifting to 5174 and away from getHost().
            await this.sandbox.commands.run(
                `npm run dev -- --host 0.0.0.0 --strictPort`,
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
            logger.error(`Error occurred while running server ${e}`)
            throw new Error(`Error occurred while starting the preview server: ${e instanceof Error ? e.message : String(e)}`)
        }
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