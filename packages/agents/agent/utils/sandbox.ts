import { Sandbox } from 'e2b'
import type { DeleteFile, ReadFile, RunCommand, WriteFile } from '../../baml_client';
import { R2 } from '../services/file-storage/fileStorage';
import path from 'path'
/*
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
export interface ExecuteRes{
    success: boolean,
    content: string,
    stdout?: string,
    stderr?: string
}
export class E2BSandbox{

    constructor(){}

    r2 = new R2()
    async Connect(id: string){
        const sandbox = await Sandbox.connect(id)
        // await sandbox.setTimeout(60*60*1000)
        return sandbox
    }
    // implement to increase the TTL of sandbox by one hour whenever any of these 
    // functions get called.
    
    async Execute(id: string, payload: ReadFile | WriteFile | DeleteFile| RunCommand): Promise<ExecuteRes>{
        const sandbox = await this.Connect(id)
        // const homeDir = 
        if(payload.action === 'read'){
            try{
                const result: string = await sandbox.files.read(payload.path)
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
                const writeRes = await sandbox.files.write(payload.path, payload.content)
                
                return {
                    success: true,
                    content: `Content written at ${writeRes.path}`
                }
            }
            catch(e){
                throw new Error("Error occurred while executing write sandbox file")
            }
        }
        else if(payload.action === 'delete'){
            try{
                const deleteRes = await sandbox.files.remove(payload.path)
                
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
                const cmdRes = await sandbox.commands.run(payload.command, {
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
                throw new Error("Error occurred while executing write sandbox cmd")
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
    async StartSandbox(userId: string, projectId: string, sandboxId?: string): Promise<string> {
        let sandbox
        let isFresh = false
        // r2 -> sandbox.
        if (sandboxId) {
            try {
                sandbox = await Sandbox.connect(sandboxId)
                await sandbox.setTimeout(60 * 60 * 1000)
            } catch (e) {
                sandbox = null  // dead, fall through to create
            }
        }
        
        if (!sandbox) {
            sandbox = await Sandbox.create()
            isFresh = true
        }

        const files = await this.r2.listFiles(this.r2.filesPrefix(userId, projectId))
        

        if (files.length > 0) {
            // restore path — pull each file, write into sandbox
            for (const key of files) {
                const content = await this.r2.getFile(key)
                const relativePath = key.replace(this.r2.filesPrefix(userId, projectId), '')
                await sandbox.files.write(relativePath, content)
            }
        } else {
            // fresh project path
            await sandbox.commands.run('npm create vite@latest . -- --template react-ts --yes')
            await sandbox.commands.run('npm install')
            await this.SyncR2(sandbox, userId, projectId)
        }

        // const tree = await sandbox.commands.run(`tree`)
        return sandbox.sandboxId
    }
    async SyncR2(sandbox: Sandbox, userId: string, projectId: string){
        /*Steps: sandbox -> r2
        - create the new path for all such files. 
        - putfile with that key for each of the file.
        copy whole directory of sandbox /home/usr  to the R2.
        */
        const cwd = await sandbox.commands.run("pwd")

        const prefix = this.r2.filesPrefix(userId, projectId)
        const result = await sandbox.commands.run(`
            find ${cwd} -f \
            -not -path '*/node_modules/*' \
            -not -path '*/dist/*' \ 
            -not -path '*/build/*' \
            -not -path '.env' 
        `)
       // I've to trust the LLM that he'll send me the right folder directory while writing any file

        const absolutePaths = result.stdout.split('\n')
            .map(p => p.trim())
            .filter(Boolean)
        
        for(let i = 0 ; i < absolutePaths.length; i += 10){
            const batch = absolutePaths.slice(i, i + 10)
            await Promise.all(batch.map(async (absPath) =>{
                const relPath = absPath.replace(`${cwd}`, "")
                const content = await sandbox.files.read(absPath)
                await this.r2.putFile(prefix + relPath, content)
            }))
        }
    }
    async SandboxHealth(sandbox: Sandbox){
        try{
            await sandbox.connect()
            return true;
        }
        catch(e){
            return false;
        }
    }
}

