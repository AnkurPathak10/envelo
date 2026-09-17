import "dotenv/config";

function readPort(value: string | undefined): number {
  if (!value) throw new Error("PORT must be set.");

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("PORT must be an integer between 1 and 65535.");

  return port;
}

function readAccessSecret(value: string | undefined): string {
  if (!value) throw new Error("JWT_ACCESS_SECRET must be set.");
  return value;
}

export const env = {
  jwtAccessSecret: readAccessSecret(process.env.JWT_ACCESS_SECRET),
  port: readPort(process.env.PORT),
};
