import { Sandbox } from 'e2b'
import type { DeleteFile, ReadFile, RunCommand, WriteFile } from '../../baml_client';

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
interface pyalod{
    action: "read" | "write" | "run" | "delete"

}
export class E2BSandbox{

    constructor(public sandboxId: string, ){
        const sandbox = await this.Connect(sandboxId)
    }

    async CreateSandbox(): Promise<string>{
        const sandbox = await Sandbox.create();
        const result = await sandbox.commands.run('echo "Hello from E2B Sandbox!"')
        console.log(result.stdout)  
        return sandbox.sandboxId
    }
    async Connect(id: string){
        const sandbox = await Sandbox.connect(id)
        await sandbox.setTimeout(60*60*1000)
        return sandbox
    }
    // implement to increase the TTL of sandbox by one hour whenever any of these 
    // functions get called.
    
    async Execute(id: string, payload: ReadFile | WriteFile | DeleteFile| RunCommand){
        const sandbox = await this.Connect(id)
        // const homeDir = 
        if(payload.action === 'read'){
            const result = sandbox.files.read("")
        }
        else if(payload.action === 'writeFile'){

        }
        else if(payload.action === 'delete'){

        }
        else if(payload.action === 'runCommand'){

        }
    }
    async ReadFile(path: string){

    }
    async RunCommand(id: string, cmd: string) {
        const sandbox = await this.Connect(id)
        const output = sandbox.commands.run(cmd)
        return output        
    }
    async StartSandbox(id: string){
        // do the preload of the code from S3.

    }
    async WriteFile(id: string, path: string, content: string){
        // check whether the code exists or up to date or not. 
        const sandbox = await this.Connect(id)
        await sandbox.files.write(path, content)



    }
    async SyncS3(id: string, filePath: string, content: string){
        // 
    }
    async GetFileContent(id: string, fileName: string){

    }
    async DeleteFile(id: string, fileName: string){

    }
    async GetProjectTree(id: string){

    }
}

