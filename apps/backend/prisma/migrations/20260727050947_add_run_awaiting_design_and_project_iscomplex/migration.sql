-- AlterEnum
ALTER TYPE "RunStatus" ADD VALUE 'AWAITING_DESIGN_SELECTION';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isComplex" BOOLEAN;
