import { userTypeDefs } from "./modules/user";

// GraphQL requires a root type to exist before `extend type` can add to it, and
// a type can't be empty — hence the `_empty` placeholders. Each domain module
// then extends Query/Mutation with its own fields, keeping schema next to the
// resolvers that implement it.
const baseTypeDefs = `#graphql
  scalar DateTime

  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }
`;

export const typeDefs = [baseTypeDefs, userTypeDefs];
