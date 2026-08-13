/*
  Warnings:

  - You are about to drop the column `monitorId` on the `alert_policies` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "alert_policies" DROP CONSTRAINT "alert_policies_monitorId_fkey";

-- DropIndex
DROP INDEX "alert_policies_monitorId_key";

-- AlterTable
ALTER TABLE "alert_policies" DROP COLUMN "monitorId";

-- AlterTable
ALTER TABLE "monitors" ADD COLUMN     "alertPolicyId" TEXT;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_alertPolicyId_fkey" FOREIGN KEY ("alertPolicyId") REFERENCES "alert_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
