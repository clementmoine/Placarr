-- AlterEnum: broaden « attendu » + consumed (Exit / used up).
ALTER TYPE "AbsenceReason" ADD VALUE IF NOT EXISTS 'expected';
ALTER TYPE "AbsenceReason" ADD VALUE IF NOT EXISTS 'consumed';
