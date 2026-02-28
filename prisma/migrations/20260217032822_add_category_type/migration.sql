-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('ENTRADA', 'SAIDA');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "type" "CategoryType" NOT NULL DEFAULT 'ENTRADA';
