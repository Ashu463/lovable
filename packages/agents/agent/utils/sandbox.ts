import { Sandbox } from 'e2b'
import type { DeleteFile, EditFile, ReadFile, RunCommand, WriteFile } from '../../baml_client';
import { R2 } from '../services/file-storage/fileStorage';

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
                await sandbox.setTimeout(60 * 60 * 1000)
            } catch (e) {
                sandbox = null
            }
        }
        
        if (!sandbox) {
            sandbox = await Sandbox.create('react-sandbox-node22')
        }

        const instance = new E2BSandbox(sandbox, userId, projectId)
        await instance.restoreOrBootstrap()
        return instance
    }
    private async restoreOrBootstrap(): Promise<void> {
        const files = await this.r2.listFiles(this.r2.filesPrefix(this.userId, this.projectId))

        if (files.length > 0) {
            console.log("Starting previous container", files.length)

const ls2 = await this.sandbox.commands.run('ls -la /home/user 2>/dev/null; ls -la / 2>/dev/null')
console.log(ls2, " is the whole list")
            for (const key of files) {
                const relativePath = key.replace(this.r2.filesPrefix(this.userId, this.projectId), '')
                const content = await this.r2.getFile(key)
                // console.log(relativePath, " is the path, ", content)
                const fileWrite = await this.Execute(this.sandboxId, {action: "writeFile", path: relativePath, content})
                const readContent = await this.Execute(this.sandboxId, {action: "read", path: relativePath})
                // console.log(relativePath, " is the path and ", readContent, " is the file writing response while spinning up the sandbox")

            }
        } else {
            console.log(await this.Execute(this.sandboxId, {action: 'runCommand', command: "pwd && ls"}))
            const pwd = await this.sandbox.commands.run('pwd')
            const home = await this.sandbox.commands.run('echo $HOME')
            // const ls = await this.sandbox.commands.run('ls -la /home/user 2>/dev/null; ls -la / 2>/dev/null')
            // console.log('root+home listing:', ls.stdout)
            console.log('pwd:', pwd.stdout)
            console.log('HOME:', home.stdout)

            const set = await this.sandbox.commands.run(
                'mkdir -p /home/user/app && cd /home/user/app && curl -fsSL https://codeload.github.com/Ashu463/react-template/tar.gz/refs/heads/master -o repo.tar.gz',
                // { cwd: '/home/user' }
            )
            console.log(set.error, set.stderr, set.stdout, " are set error")
            const zip = await this.sandbox.commands.run(
    'tar -xzf repo.tar.gz --strip-components=1 && rm repo.tar.gz',
    { cwd: '/home/user/app' }
)   
const ls2 = await this.sandbox.commands.run('ls -la /home/user 2>/dev/null; ls -la / 2>/dev/null')
console.log('root+home listing, after code cloning:', ls2.stdout)
// const check = await this.sandbox.commands.run('pwd && ls -la /home/user && cat /home/user/package.json')
// console.log(check, " is the check output")
            // console.log(await this.sandbox.commands.run(`ls -la && pwd`))
            const install = await this.sandbox.commands.run('npm install', 
                { cwd: '/home/user/app' }
            )
// console.log('exitCode:', install.exitCode)
// console.log('stdout:', install.stdout)
// console.log('stderr:', install.stderr)

            console.log("--------------Sandbox Starting done-------------------- id is, ", this.sandboxId)

            await this.SyncR2()
        }
    }
    // implement to increase the TTL of sandbox by one hour whenever any of these 
    // functions get called.
    
    async Execute(id: string, payload: ReadFile | WriteFile | EditFile | DeleteFile| RunCommand): Promise<ExecuteRes>{
        // const homeDir = 
        if(payload.action === 'read'){
            try{
                const result: string = await this.sandbox.files.read(payload.path)
                return {
                    success: true,
                    content: result
                }
            }
            catch(e){
                throw new Error("Error occured while reading from sandbox file")
            }
        }
        else if(payload.action === 'writeFile'){
            try{
                const writeRes = await this.sandbox.files.write(payload.path, payload.content)
                
                return {
                    success: true,
                    content: `Content written at ${writeRes.path}`
                }
            }
            catch(e){
                throw new Error("Error occurred while executing write sandbox file")
            }
        }
        else if(payload.action === 'editFile'){
            throw new Error(`To be implemented don't call this please`)
        }
        else if(payload.action === 'delete'){
            try{
                const deleteRes = await this.sandbox.files.remove(payload.path)
                
                return {
                    success: true,
                    content: `Deleted file is ${deleteRes}`
                }
            }
            catch(e){
                throw new Error("Error occurred while executing deleting sandbox file")
            }
        }
        else if(payload.action === 'runCommand'){
            try{
                const cmdRes = await this.sandbox.commands.run(payload.command, {
                    timeoutMs: 60000
                })

                if(cmdRes.exitCode !== 0){
                    return {
                        success: false, 
                        content: cmdRes.stderr || cmdRes.stdout
                    }
                }
                return {
                    success: true,
                    content: cmdRes.stderr + cmdRes.stdout,
                    stderr: cmdRes.stderr,
                    stdout: cmdRes.stdout
                }
            }
            catch(e){
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
        const cwd = (await this.sandbox.commands.run("pwd")).stdout.trim()
        const prefix = this.r2.filesPrefix(this.userId, this.projectId)
        const findCmd = [
            `find ${cwd} -type f`,
            `-not -path '*/node_modules/*'`,
            `-not -path '*/dist/*'`,
            `-not -path '*/build/*'`,
            `-not -path '*/.git/*'`,
            `-not -path '*/.npm/*'`,
            `-not -name '.env'`,
            `-not -name .gitignore`
        ].join(' ')

        const result = await this.sandbox.commands.run(findCmd)
        // console.log(result, " is the find -type f command result")
       // I've to trust the LLM that he'll send me the right folder directory while writing any file

        const absolutePaths = result.stdout.split('\n')
            .map(p => p.trim())
            .filter(Boolean)
        
        for(let i = 0 ; i < absolutePaths.length; i += 10){
            const batch = absolutePaths.slice(i, i + 10)
            await Promise.all(batch.map(async (absPath) =>{
                const relPath = absPath.replace(`${cwd}`, "")
                const content = await this.sandbox.files.read(absPath)
                await this.r2.putFile(prefix + relPath, content)
            }))
        }
    }
    Release(){
        this.sandbox.kill
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