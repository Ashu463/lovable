import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import type { Express } from "express";
import { typeDefs } from "./schema";
import { resolvers } from "./resolver";
import { createContext, type GraphQLContext } from "./context";

// Mounts Apollo at /graphql on an existing Express app. The app keeps serving
// the REST routers alongside it while domains are ported over one at a time.
export async function mountGraphQL(app: Express, path = "/graphql") {
  const server = new ApolloServer<GraphQLContext>({ typeDefs, resolvers });
  await server.start();

  app.use(path, expressMiddleware(server, { context: createContext }));

  return server;
}
