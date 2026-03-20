ALTER TABLE "chats" ADD COLUMN "pinned_message_id" TEXT;

CREATE INDEX "chats_pinned_message_id_idx" ON "chats"("pinned_message_id");

ALTER TABLE "chats"
ADD CONSTRAINT "chats_pinned_message_id_fkey"
FOREIGN KEY ("pinned_message_id")
REFERENCES "messages"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
