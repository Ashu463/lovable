import { GraphQLScalarType, Kind } from "graphql";

// Prisma hands us JS Date objects; the wire format is ISO-8601 strings.
export const DateTimeScalar = new GraphQLScalarType({
  name: "DateTime",
  description: "An ISO-8601 encoded UTC date-time string",

  serialize(value) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string") return new Date(value).toISOString();
    throw new TypeError("DateTime must be a Date or an ISO string");
  },

  parseValue(value) {
    if (typeof value !== "string") {
      throw new TypeError("DateTime must be an ISO string");
    }
    return new Date(value);
  },

  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) {
      throw new TypeError("DateTime must be an ISO string");
    }
    return new Date(ast.value);
  },
});
