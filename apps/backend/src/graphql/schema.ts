import { userTypeDefs } from "./modules/user";
import { projectTypeDefs } from "./modules/project";
import { runTypeDefs } from "./modules/run";
import { chatTypeDefs } from "./modules/chat";
import { designTypeDefs } from "./modules/design";
import { questionTypeDefs } from "./modules/question";
import { streamTypeDefs } from "./modules/stream";
import { internalTypeDefs } from "./modules/internal";

// GraphQL requires a root type to exist before `extend type` can add to it, and
// a type can't be empty — hence the `_empty` placeholders. Each domain module
// then extends Query/Mutation with its own fields, keeping schema next to the
// resolvers that implement it.
const baseTypeDefs = `#graphql
  scalar DateTime
  scalar JSON

  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }
`;

export const typeDefs = [
  baseTypeDefs,
  userTypeDefs,
  projectTypeDefs,
  runTypeDefs,
  chatTypeDefs,
  designTypeDefs,
  questionTypeDefs,
  streamTypeDefs,
  internalTypeDefs,
];
