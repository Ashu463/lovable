class Task{
    id string
    objective string
    agent string
    depends_upon string[]
}
enum Skill {
  WebSearch
  Read_blog
  Read_docs
  Read_file
  Write_file
  Edit_file
  Bash
  Pytest
  Jest
  Read_codebase
}

class SubAgent{
    name string
    skills Skill[]
}
function CheckComplexityAndPlanTask(userPrompt: string, subAgents: SubAgent[]) -> Task{

    client "openai-generic/deepseek-v4-flash"
    prompt #"
        Analyze the user prompt and check the complexity of task, if complex then
        divide into todos various available subagents: {{subAgents}}
    
        User Prompt: {{userPrompt}}

        {{ctx.output_format}}

    "#
}

test PlanTask{
    functions [CheckComplexityAndPlanTask]
    args{
        userPrompt #"Make a complex todo app"#
        subAgents  [
            {
                name "ResearchAgent"
                skills [WebSearch, Read_blog, Read_docs]
            }
            {
                name "CodingAgent"
                skills [Read_file, Write_file, Edit_file, Read_codebase]
            }
            {
                name "TestAgent"
                skills [Pytest, Jest]
            }
        ]

    }
}
