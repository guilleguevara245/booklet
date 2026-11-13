ALTER TABLE "bookings" ADD COLUMN "manage_token_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_manage_token_key" ON "bookings" USING btree ("manage_token_hash");