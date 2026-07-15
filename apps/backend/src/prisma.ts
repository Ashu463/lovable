import dotenv from 'dotenv'
dotenv.config()
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
// declare global {
//   var prisma: PrismaClient | undefined;
// }

// export const prisma =
//   global.prisma ??
//   new PrismaClient();

// if (process.env.NODE_ENV !== "production") {
//   global.prisma = prisma;
// }

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
});