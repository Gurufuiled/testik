-- AlterTable
ALTER TABLE "users" ADD COLUMN "handle" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");
