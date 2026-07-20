/*
  Warnings:

  - You are about to drop the column `summary` on the `Design` table. All the data in the column will be lost.
  - Made the column `htmlContent` on table `Design` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Design" DROP COLUMN "summary",
ALTER COLUMN "htmlContent" SET NOT NULL;
