// The schema lives in ./schema/*.graphql, one file per domain, next to the
// resolvers that implement it in ./modules. Keeping it in real .graphql files
// (rather than template literals) means editors syntax-highlight it and GitHub
// counts the project as using GraphQL.
//
// base must come first: the domain files `extend` the root types it declares.
import base from "./schema/base.graphql" with { type: "text" };
import user from "./schema/user.graphql" with { type: "text" };
import project from "./schema/project.graphql" with { type: "text" };
import run from "./schema/run.graphql" with { type: "text" };
import chat from "./schema/chat.graphql" with { type: "text" };
import design from "./schema/design.graphql" with { type: "text" };
import question from "./schema/question.graphql" with { type: "text" };
import uiPreference from "./schema/uiPreference.graphql" with { type: "text" };
import stream from "./schema/stream.graphql" with { type: "text" };
import internal from "./schema/internal.graphql" with { type: "text" };

export const typeDefs = [
  base,
  user,
  project,
  run,
  chat,
  design,
  question,
  uiPreference,
  stream,
  internal,
];
