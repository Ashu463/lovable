import { DateTimeScalar } from "./scalars";
import { userResolvers } from "./modules/user";

// Merged one domain at a time as the REST routers in src2/ are ported. Query and
// Mutation are spread explicitly because a shallow merge would drop all but the
// last module's root fields.
export const resolvers = {
  DateTime: DateTimeScalar,

  Query: {
    ...userResolvers.Query,
  },

  Mutation: {
    ...userResolvers.Mutation,
  },
};
