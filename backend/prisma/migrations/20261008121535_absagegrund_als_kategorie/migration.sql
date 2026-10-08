/*
  Warnings:

  - The `cancellation_reason` column on the `appointments` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "cancellation_reason" AS ENUM ('STAFF_UNAVAILABLE', 'CUSTOMER_REQUEST', 'OPERATIONAL', 'SONSTIGES');

-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "cancellation_reason",
ADD COLUMN     "cancellation_reason" "cancellation_reason";
