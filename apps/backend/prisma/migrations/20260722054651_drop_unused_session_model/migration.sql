/*
  Warnings:

  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "User" ALTER COLUMN "semanticMem" SET DEFAULT '';

-- DropTable
DROP TABLE "Session";
