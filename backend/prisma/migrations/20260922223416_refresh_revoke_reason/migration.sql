-- CreateEnum
CREATE TYPE "refresh_revoke_reason" AS ENUM ('ROTATED', 'LOGOUT', 'COMPROMISED');

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "revoked_reason" "refresh_revoke_reason";
