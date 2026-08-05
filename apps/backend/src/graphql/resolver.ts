import { DateTimeScalar, JSONScalar } from "./scalars";
import { userResolvers } from "./modules/user";
import { projectResolvers } from "./modules/project";
import { runResolvers } from "./modules/run";
import { chatResolvers } from "./modules/chat";
import { designResolvers } from "./modules/design";
import { questionResolvers } from "./modules/question";
import { streamResolvers } from "./modules/stream";

// Merged one domain at a time as the REST routers in src2/ are ported. Every
// shared type is spread rather than assigned, because three modules contribute
// fields to Project and a plain assignment would drop all but the last.
export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  Query: {
    ...userResolvers.Query,
    ...projectResolvers.Query,
    ...runResolvers.Query,
    ...chatResolvers.Query,
    ...designResolvers.Query,
    ...questionResolvers.Query,
  },

  Mutation: {
    ...userResolvers.Mutation,
    ...projectResolvers.Mutation,
    ...chatResolvers.Mutation,
    ...designResolvers.Mutation,
    ...questionResolvers.Mutation,
  },

  Subscription: {
    ...streamResolvers.Subscription,
  },

  Project: {
    ...runResolvers.Project,
    ...designResolvers.Project,
    ...questionResolvers.Project,
  },

  Run: runResolvers.Run,
  Todo: runResolvers.Todo,
  TaskSummary: runResolvers.TaskSummary,
  Question: questionResolvers.Question,
};
