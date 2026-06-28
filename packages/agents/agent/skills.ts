import type { Tool } from "../types/types";

export const skills = {
    "webSearch": WebSearch(),
    "read_docs": ReadDocs(),
    "read_blogs": ReadBlogs(),
    "read_file": Read(),
    "write_file": Write(),
    "edit_file": Edit(),
    "bash": Bash(),
    "pytest": Py_test(),
    "jest": Jest(),
    "read_codebase": ReadAcrossCodebase()
}
export class Skill {
    constructor(
        public name: string,
        public description: string,
        public requiredTools: Tool[]
    ) {}
}
// Abhi ke liye I'm making these as functions but in future might update them with MCP.
function WebSearch(){

}
function ReadDocs(){

}
function ReadBlogs(){

}
function Read(){

}
function Write(){

}
function Edit(){

}
function Bash(){

}
function Py_test(){

}
function Jest(){

}
function ReadAcrossCodebase(){

}

// and so on. 