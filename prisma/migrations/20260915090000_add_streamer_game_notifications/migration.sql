-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'STREAMER_LIVE';

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "streamer_alert_email_opt_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "streamer_alert_sound_duration_ms" INTEGER,
ADD COLUMN     "streamer_alert_sound_opt_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "streamer_alert_sound_url" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twitch_linked_at" TIMESTAMP(3),
ADD COLUMN     "twitch_user_id" TEXT;

-- CreateTable
CREATE TABLE "StreamerGameAlert" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER NOT NULL,
    "streamer_id" INTEGER NOT NULL,
    "twitch_user_id" TEXT NOT NULL,
    "twitch_login" TEXT NOT NULL,
    "twitch_stream_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "notified_at" TIMESTAMP(3),
    "vod_id" TEXT,
    "vod_url" TEXT,
    "vod_timestamp_seconds" INTEGER,
    "vod_checked_at" TIMESTAMP(3),
    "vod_check_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamerGameAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StreamerGameAlert_game_id_idx" ON "StreamerGameAlert"("game_id");

-- CreateIndex
CREATE INDEX "StreamerGameAlert_vod_id_idx" ON "StreamerGameAlert"("vod_id");

-- CreateIndex
CREATE UNIQUE INDEX "StreamerGameAlert_streamer_id_game_id_key" ON "StreamerGameAlert"("streamer_id", "game_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_twitch_user_id_key" ON "User"("twitch_user_id");

-- AddForeignKey
ALTER TABLE "StreamerGameAlert" ADD CONSTRAINT "StreamerGameAlert_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamerGameAlert" ADD CONSTRAINT "StreamerGameAlert_streamer_id_fkey" FOREIGN KEY ("streamer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
