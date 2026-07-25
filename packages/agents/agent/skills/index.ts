import type { Skill } from "../../baml_client";

const skillFiles: Record<SkillId, string> = {
    1: "design-system.md",
    2: "dependency-policy.md",
    3: "triage-protocol.md",
    4: "derive-acceptance-criteria.md",
    5: "smoke-checklist.md",
    6: "responsive-rules.md",
    7: "report-format.md",
    8: "source-quality-rubric.md",
    9: "scaffold-new-project.md",
    10: "add-a-route.md",
    11: "database-integration.md",
    12: "api-route-conventions.md",
    13: "state-management-rules.md",
    14: "form-handling.md",
    15: "layout-patterns.md",
    16: "asset-policy.md",
    17: "visual-verification.md",
    100: "project-convention.md",
};
  
type SkillId = (typeof skillsMapper)[keyof typeof skillsMapper];

const globalSkills = [
skillsMapper.PROJECT_CONVENTION,
] as const;

type GlobalSkill = typeof globalSkills[number];

type RoleBasedSkill =
| typeof skillsMapper.DEPENDENCY_POLICY
| typeof skillsMapper.DERIVE_ACCEPTANCE_CRITERIA
| typeof skillsMapper.RESPONSIVE_RULES;

type TaskBasedSkill =
Exclude<SkillId, GlobalSkill | RoleBasedSkill>;

type SkillStoreType =
| {
    type: "roleBased";
    skills: RoleBasedSkill[];
    }
| {
    type: "taskBased";
    skills: TaskBasedSkill[];
    };

export class SkillStore {
    constructor() {}

    // will be same for both main and subagents
    public globalSkills(): Skill {
        return globalSkills.map((id) => this.fetchSkill(id)).join("\n\n");
    }
    
    public getMainAgentRoleSkills(): Skill{

    }
    // for listing to the LLM, name and description only
    public getAllTaskSkills(): Skill{
        
    }
    public getCoderSkills(): Skill{

    }

    public getSkills(agentType: string): string {
        switch (store.type) {
        case "roleBased":
            return store.skills.map((id) => this.fetchSkill(id)).join("\n\n");
        case "taskBased":

        default:
            return "";
        }
    }

    private fetchSkill(id: SkillId): string {
        const file = skillFiles[id];
        // Example:
        // return fs.readFileSync(`skills/${id}.md`, "utf8");

        return `Skill ${id}`;
    }
}