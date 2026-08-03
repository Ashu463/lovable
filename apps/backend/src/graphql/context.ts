import { prisma } from '../../prisma';

export async function createContext({ req }: any) {
    return {
        prisma,
        req,
    };
}