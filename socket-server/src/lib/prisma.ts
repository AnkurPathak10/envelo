import { PrismaClient } from "../generated/prisma";

import { env } from "./env";

export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
});

let isDisconnecting = false;

export async function disconnectPrisma(): Promise<void> {
  if (isDisconnecting) return;
  isDisconnecting = true;
  await prisma.$disconnect();
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  try {
    await disconnectPrisma();
    process.exit(0);
  } catch (error: unknown) {
    console.error(`Prisma shutdown failed after ${signal}.`);
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
