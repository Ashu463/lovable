import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express5";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createHandler } from "graphql-sse/lib/use/express";
import type { Express } from "express";
import { typeDefs } from "./schema";
import { resolvers } from "./resolver";
import { createContext, type GraphQLContext } from "./context";

// Built once and shared: Apollo serves queries and mutations, while graphql-sse
// serves subscriptions. Both must execute against the same schema instance.
export const schema = makeExecutableSchema({ typeDefs, resolvers });

// Mounts GraphQL on an existing Express app. The app keeps serving the REST
// routers alongside it while domains are ported over one at a time.
export async function mountGraphQL(app: Express, path = "/graphql") {
  const server = new ApolloServer<GraphQLContext>({ schema });
  await server.start();

  // Mounted before the Apollo middleware: `app.use(path, ...)` matches by
  // prefix, so mounting /graphql first would swallow /graphql/stream too.
  // SSE rather than WebSockets: the browser needs to send an Authorization
  // header, which works over a normal request but not a WebSocket handshake.
  app.use(
    `${path}/stream`,
    createHandler({
      schema,
      context: async (req) => {
        // graphql-sse types headers as either a plain bag or a Headers-like
        // object depending on the adapter, so normalise before reading.
        const headers = req.headers as {
          authorization?: string;
          get?: (key: string) => string | null;
        };
        const authorization =
          typeof headers.get === "function"
            ? (headers.get("authorization") ?? undefined)
            : headers.authorization;

        const ctx = await createContext({ req: { headers: { authorization } } });
        return ctx as unknown as Record<PropertyKey, unknown>;
      },
    }),
  );

  app.use(path, expressMiddleware(server, { context: createContext }));

  return server;
}
