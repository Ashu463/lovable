import { DateTimeScalar, JSONScalar } from "./scalars";
import { userResolvers } from "./modules/user";
import { projectResolvers } from "./modules/project";
import { runResolvers } from "./modules/run";

// Merged one domain at a time as the REST routers in src2/ are ported. Query and
// Mutation are spread explicitly because a shallow merge would drop all but the
// last module's root fields.
export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  Query: {
    ...userResolvers.Query,
    ...projectResolvers.Query,
    ...runResolvers.Query,
  },

  Mutation: {
    ...userResolvers.Mutation,
    ...projectResolvers.Mutation,
  },

  // Type-level resolvers for nested fields.
  Project: runResolvers.Project,
  Run: runResolvers.Run,
  Todo: runResolvers.Todo,
  TaskSummary: runResolvers.TaskSummary,
};
