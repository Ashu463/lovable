import { GraphQLScalarType, Kind, type ValueNode } from "graphql";

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

// Todo.agentSpecificData is a free-form Prisma Json column, so there is no fixed
// shape to model as a GraphQL type. Values pass through untouched.
export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  description: "Arbitrary JSON value",

  serialize: (value) => value,
  parseValue: (value) => value,

  parseLiteral(ast) {
    const parse = (node: ValueNode): unknown => {
      switch (node.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
          return node.value;
        case Kind.INT:
        case Kind.FLOAT:
          return Number(node.value);
        case Kind.NULL:
          return null;
        case Kind.LIST:
          return node.values.map(parse);
        case Kind.OBJECT:
          return Object.fromEntries(
            node.fields.map((f) => [f.name.value, parse(f.value)]),
          );
        default:
          return null;
      }
    };
    return parse(ast);
  },
});
