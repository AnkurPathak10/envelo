import "dotenv/config";

function readPort(value: string | undefined): number {
  if (!value) throw new Error("PORT must be set.");

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PORT must be an integer between 1 and 65535.");

  return port;
}

function readAccessSecret(value: string | undefined): string {
  if (!value?.trim()) throw new Error("JWT_ACCESS_SECRET must be set.");
  return value;
}

function readDatabaseUrl(value: string | undefined): string {
  if (!value?.trim()) throw new Error("DATABASE_URL must be set.");
  return value;
}

function readImageKitUrlEndpoint(value: string | undefined): string {
  if (!value?.trim()) throw new Error("IMAGEKIT_URL_ENDPOINT must be set.");
  try {
    return new URL(value.trim()).toString().replace(/\/+$/, "");
  } catch {
    throw new Error("IMAGEKIT_URL_ENDPOINT must be a valid URL.");
  }
}

export const env = {
  databaseUrl: readDatabaseUrl(process.env.DATABASE_URL),
  imageKitUrlEndpoint: readImageKitUrlEndpoint(
    process.env.IMAGEKIT_URL_ENDPOINT,
  ),
  jwtAccessSecret: readAccessSecret(process.env.JWT_ACCESS_SECRET),
  port: readPort(process.env.PORT),
};
