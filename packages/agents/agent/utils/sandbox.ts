import { CommandExitError, Sandbox } from 'e2b'
import type { DeleteFile, EditFile, ReadFile, RunCommand, WriteFile } from '../../baml_client';
import { R2 } from '../services/file-storage/fileStorage';
import { SANDBOX_HOME, PROJECT_ROOT, RUN_COMMAND_TIMEOUT_MS, SANDBOX_TIMEOUT_MS } from '../config/systemConfig';
import { logger } from './logger';

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
    r2 = new R2()
    private constructor(sandbox: Sandbox, userId: string, projectId: string){
        this.sandbox = sandbox
        this.userId = userId
        this.projectId = projectId
    }
    get sandboxId(): string{
        return this.sandbox.sandboxId
    }

    async Connect(id: string){
        const sandbox = await Sandbox.connect(id)
        // await sandbox.setTimeout(60*60*1000)
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

            for (const key of files) {
                const relativePath = key.replace(this.r2.filesPrefix(this.userId, this.projectId), '')
                const content = await this.r2.getFile(key)
                await this.Execute(this.sandboxId, {
                    action: 'writeFile',
                    path: `${SANDBOX_HOME}${relativePath}`,
                    content
                })
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

            await this.SyncR2()
        }

    }
    private resolvePath(path: string): string {
        if (path.startsWith('/')) return path
        return `${PROJECT_ROOT}/${path.replace(/^\.\//, '')}`
    }

    async getRepoTree(): Promise<string>{
        try{
            const result = await this.sandbox.commands.run(
                "find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -name '.env'",
                { cwd: PROJECT_ROOT }
            )
            return result.stdout

        }
        catch(e){
            logger.error(`Failed to generate repo tree: ${e}`)
            throw new Error(`Error occurred while generating repository tree`)
        }
    }
    
    async Execute(id: string, payload: ReadFile | WriteFile | EditFile | DeleteFile| RunCommand): Promise<ExecuteRes>{
        // const homeDir = 

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
                const reason = e instanceof Error ? e.message : String(e)
                logger.error(`Failed to read ${path}: ${reason}`)
                throw new Error(`Failed to read ${path}: ${reason}`)
            }
        }
        else if(payload.action === 'writeFile'){
            const path = this.resolvePath(payload.path)
            try{
                const writeRes = await this.sandbox.files.write(path, payload.content)

                return {
                    success: true,
                    content: `Content written at ${writeRes.path}`
                }
            }
            catch(e){
                const reason = e instanceof Error ? e.message : String(e)
                logger.error(`Failed to write ${path}: ${reason}`)
                throw new Error(`Failed to write ${path}: ${reason}`)
            }
        }
        else if(payload.action === 'editFile'){
            throw new Error(`To be implemented don't call this please`)
        }
        else if(payload.action === 'delete'){
            const path = this.resolvePath(payload.path)
            try{
                const deleteRes = await this.sandbox.files.remove(path)

                return {
                    success: true,
                    content: `Deleted file is ${deleteRes}`
                }
            }
            catch(e){
                const reason = e instanceof Error ? e.message : String(e)
                logger.error(`Failed to delete ${path}: ${reason}`)
                throw new Error(`Failed to delete ${path}: ${reason}`)
            }
        }
        else if(payload.action === 'runCommand'){
            const cwd = payload.cwd ? this.resolvePath(payload.cwd) : PROJECT_ROOT
            try{
                const cmdRes = await this.sandbox.commands.run(payload.command, {
                    cwd,
                    timeoutMs: RUN_COMMAND_TIMEOUT_MS
                })
                // e2b resolves here only on exit 0 — a non-zero exit throws
                // CommandExitError instead, so this branch is actually dead,
                // but kept in case that ever changes.
                return {
                    success: true,
                    content: cmdRes.stderr + cmdRes.stdout,
                    stderr: cmdRes.stderr,
                    stdout: cmdRes.stdout
                }
            }
            catch(e){
                // CommandExitError carries the actual stdout/stderr/exitCode of
                // the failed command — that's exactly what the coder/debugger
                // needs to fix it. Surface it as a normal failed ExecuteRes
                // instead of swallowing it into a generic thrown Error; only
                // genuinely unexpected errors (sandbox connection lost, etc.)
                // should still throw.
                if(e instanceof CommandExitError){
                    logger.error(`Command "${payload.command}" (cwd: ${cwd}) exited ${e.exitCode}: ${e.stderr || e.stdout}`)
                    return {
                        success: false,
                        content: e.stderr || e.stdout || e.error || `Command exited with code ${e.exitCode}`,
                        stdout: e.stdout,
                        stderr: e.stderr
                    }
                }
                logger.error(`Failed to run command "${payload.command}" (cwd: ${cwd}): ${e}`)
                throw new Error("Error occurred while executing sandbox cmd")
            }
        }
        return {
            success: false,
            content: "Unknown error occurred"
        }
    }

     /* Steps: 
        - if any s3id exists corresponding to this user id and this session id
            then load the code from the s3's that directory itself.
        - else run npm create-vite@latest and return the current tree of the code. 
        */
    
    async SyncR2(){
        /*Steps: sandbox -> r2
        - create the new path for all such files.
        - putfile with that key for each of the file.
        copy whole directory of sandbox /home/usr  to the R2.
        */
        const prefix = this.r2.filesPrefix(this.userId, this.projectId)
        const findCmd = [
            `find ${PROJECT_ROOT} -type f`,
            `-not -path '*/node_modules/*'`,
            `-not -path '*/dist/*'`,
            `-not -path '*/build/*'`,
            `-not -path '*/.git/*'`,
            `-not -path '*/.npm/*'`,
            `-not -name '.env'`,
            `-not -name .gitignore`
        ].join(' ')

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

    async GetPreviewUrl(): Promise<string>{
        try{
            const probe = await this.sandbox.commands.run(
                "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 || true",
                { cwd: PROJECT_ROOT }
            )
            if(probe.stdout.trim() === '000'){
                await this.sandbox.commands.run("npm run dev", {
                    cwd: PROJECT_ROOT,
                    background: true,
                });
                await new Promise((resolve) => setTimeout(resolve, 3000))
            }

            return `https://${this.sandbox.getHost(3000)}` // or 5173, 8080, etc.

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