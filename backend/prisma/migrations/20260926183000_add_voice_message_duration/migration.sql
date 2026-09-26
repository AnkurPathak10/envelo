-- Voice notes use the existing media URL plus explicit duration metadata.
ALTER TABLE "Message" ADD COLUMN "audioDurationMs" INTEGER;
