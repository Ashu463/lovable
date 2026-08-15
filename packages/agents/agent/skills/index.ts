import type { Skill } from "../../baml_client";
import type { SubAgentType } from "../../types/subAgentsTypes";

export type AgentKey = SubAgentType | "agent";

const skillsMapper = {
    PROJECT_CONVENTION: 0,
    DESIGN_SYSTEM: 1,
    DEPENDENCY_POLICY: 2,
    TRIAGE_PROTOCOL: 3,
    DERIVE_ACCEPTANCE_CRITERIA: 4,
    SMOKE_CHECKLIST: 5,
    RESPONSIVE_RULES: 6,
    REPORT_FORMAT: 7,
    SOURCE_QUALITY_RUBRIC: 8,
    SCAFFOLD_NEW_PROJECT: 9,
    ADD_A_ROUTE: 10,
    DATABASE_INTEGRATION: 11,
    API_ROUTE_CONVENTIONS: 12,
    STATE_MANAGEMENT_RULES: 13,
    FORM_HANDLING: 14,
    LAYOUT_PATTERNS: 15,
    ASSET_POLICY: 16,
    VISUAL_VERIFICATION: 17,
} as const;

type SkillId = (typeof skillsMapper)[keyof typeof skillsMapper];

const skillFiles: Record<SkillId, string> = {
    [skillsMapper.DESIGN_SYSTEM]: "design-systems",
    [skillsMapper.DEPENDENCY_POLICY]: "dependency",
    [skillsMapper.TRIAGE_PROTOCOL]: "triage",
    [skillsMapper.DERIVE_ACCEPTANCE_CRITERIA]: "acceptance-criteria",
    [skillsMapper.SMOKE_CHECKLIST]: "baseline-checks",
    [skillsMapper.RESPONSIVE_RULES]: "responsive-rules",
    [skillsMapper.REPORT_FORMAT]: "research-format",
    [skillsMapper.SOURCE_QUALITY_RUBRIC]: "source-quality-rubric",
    [skillsMapper.SCAFFOLD_NEW_PROJECT]: "scaffold-new-project",
    [skillsMapper.ADD_A_ROUTE]: "add-a-route",
    [skillsMapper.DATABASE_INTEGRATION]: "db-integration",
    [skillsMapper.API_ROUTE_CONVENTIONS]: "api-route-convention",
    [skillsMapper.STATE_MANAGEMENT_RULES]: "state-management-rules",
    [skillsMapper.FORM_HANDLING]: "form-handling",
    [skillsMapper.LAYOUT_PATTERNS]: "layout-patterns",
    [skillsMapper.ASSET_POLICY]: "asset-policy",
    [skillsMapper.VISUAL_VERIFICATION]: "visual-verification",
    [skillsMapper.PROJECT_CONVENTION]: "project-conventions",
};

// canonical `name:` frontmatter value per id — the reverse of this table is
// how a getSkill(skillName) tool call resolves back to an id.
const skillNames: Record<SkillId, string> = {
    [skillsMapper.DESIGN_SYSTEM]: "design-system",
    [skillsMapper.DEPENDENCY_POLICY]: "dependency-policy",
    [skillsMapper.TRIAGE_PROTOCOL]: "triage-protocol",
    [skillsMapper.DERIVE_ACCEPTANCE_CRITERIA]: "derive-acceptance-criteria",
    [skillsMapper.SMOKE_CHECKLIST]: "smoke-checklist",
    [skillsMapper.RESPONSIVE_RULES]: "responsive-rules",
    [skillsMapper.REPORT_FORMAT]: "report-format",
    [skillsMapper.SOURCE_QUALITY_RUBRIC]: "source-quality-rubric",
    [skillsMapper.SCAFFOLD_NEW_PROJECT]: "scaffold-new-project",
    [skillsMapper.ADD_A_ROUTE]: "add-a-route",
    [skillsMapper.DATABASE_INTEGRATION]: "database-integration",
    [skillsMapper.API_ROUTE_CONVENTIONS]: "api-route-conventions",
    [skillsMapper.STATE_MANAGEMENT_RULES]: "state-management-rules",
    [skillsMapper.FORM_HANDLING]: "form-handling",
    [skillsMapper.LAYOUT_PATTERNS]: "layout-patterns",
    [skillsMapper.ASSET_POLICY]: "asset-policy",
    [skillsMapper.VISUAL_VERIFICATION]: "visual-verification",
    [skillsMapper.PROJECT_CONVENTION]: "project-conventions",
};

// FIX: Please fix this whenever you're updating whole UI expert agent, temporarily
// design-ui skill have been given to the ui expert agent. 
const skillFileOverrides: Partial<Record<AgentKey, Partial<Record<SkillId, string>>>> = {
    uiExpert: {
        [skillsMapper.DESIGN_SYSTEM]: "design-ui",
    },
};

const GLOBAL_SKILLS: SkillId[] = [skillsMapper.PROJECT_CONVENTION];

const ROLE_SKILLS: Record<AgentKey, SkillId[]> = {
    coder: [skillsMapper.DESIGN_SYSTEM, skillsMapper.DEPENDENCY_POLICY, skillsMapper.ADD_A_ROUTE],
    debuggerr: [skillsMapper.TRIAGE_PROTOCOL],
    tester: [skillsMapper.DERIVE_ACCEPTANCE_CRITERIA, skillsMapper.SMOKE_CHECKLIST],
    researcher: [skillsMapper.REPORT_FORMAT, skillsMapper.SOURCE_QUALITY_RUBRIC],
    uiExpert: [skillsMapper.DESIGN_SYSTEM, skillsMapper.RESPONSIVE_RULES],
    
    agent: [skillsMapper.DESIGN_SYSTEM, skillsMapper.DEPENDENCY_POLICY],
};

const TASK_SKILLS: Record<AgentKey, SkillId[]> = {
    coder: [
        skillsMapper.SCAFFOLD_NEW_PROJECT,
        skillsMapper.DATABASE_INTEGRATION,
        skillsMapper.API_ROUTE_CONVENTIONS,
        skillsMapper.STATE_MANAGEMENT_RULES,
        skillsMapper.FORM_HANDLING,
    ],
    debuggerr: [],
    tester: [skillsMapper.VISUAL_VERIFICATION],
    researcher: [],
    uiExpert: [skillsMapper.LAYOUT_PATTERNS, skillsMapper.ASSET_POLICY],
    agent: [
        skillsMapper.SCAFFOLD_NEW_PROJECT,
        skillsMapper.ADD_A_ROUTE,
        skillsMapper.DATABASE_INTEGRATION,
        skillsMapper.API_ROUTE_CONVENTIONS,
        skillsMapper.STATE_MANAGEMENT_RULES,
        skillsMapper.FORM_HANDLING,
    ],
};

export class SkillStore {
    private cache = new Map<string, Skill>();
    private nameToId = new Map<string, SkillId>(
        (Object.entries(skillNames) as [string, string][]).map(([id, name]) => [name, Number(id) as SkillId]),
    );

    constructor() {}

    async globalSkills(agent?: AgentKey): Promise<Skill[]> {
        return Promise.all(GLOBAL_SKILLS.map((id) => this.loadSkill(id, agent)));
    }

    async getRoleSkills(agent: AgentKey): Promise<Skill[]> {
        return Promise.all(ROLE_SKILLS[agent].map((id) => this.loadSkill(id, agent)));
    }

    async getTaskCatalog(agent: AgentKey): Promise<Skill[]> {
        const skills = await this.getTaskSkillsFull(agent);
        return skills.map(({ name, description }) => ({ name, description, content: null }));
    }

    async getTaskSkillsFull(agent: AgentKey): Promise<Skill[]> {
        return Promise.all(TASK_SKILLS[agent].map((id) => this.loadSkill(id, agent)));
    }

    async fetchSkillContent(skillName: string, agent?: AgentKey): Promise<string> {
        const id = this.nameToId.get(skillName);
        if (id === undefined) {
            throw new Error(`Unknown skill requested via getSkill: "${skillName}"`);
        }
        const skill = await this.loadSkill(id, agent);
        return skill.content ?? "";
    }

    renderAsText(skills: Skill[]): string {
        return skills.map((s) =>
            s.content? `## ${s.name}\n${s.description}\n\n${s.content}`:`## ${s.name} (call getSkill("${s.name}") to load full content)\n${s.description}`,
            ).join("\n\n");
    }

    private async loadSkill(id: SkillId, agent?: AgentKey): Promise<Skill> {
        // for UI expert agent only
        const folder = (agent && skillFileOverrides[agent]?.[id]) ?? skillFiles[id];
        const cached = this.cache.get(folder);
        if (cached) return cached;

        const path = `${import.meta.dir}/${folder}/SKILL.md`;
        const raw = await Bun.file(path).text();
        const { name, description, content } = this.parseSkillFile(raw);
        const skill: Skill = { name, description, content };
        this.cache.set(folder, skill);
        return skill;
    }

    private parseSkillFile(raw: string): { name: string; description: string; content: string } {
        const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        const frontmatter = match?.[1] ?? "";
        const body = (match?.[2] ?? raw).trim();
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
        return {
            name: nameMatch?.[1]?.trim() ?? "",
            description: descMatch?.[1]?.trim() ?? "",
            content: body,
        };
    }
}
