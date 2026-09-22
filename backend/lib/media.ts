import { createHmac, randomUUID } from "node:crypto";

const UPLOAD_CREDENTIAL_LIFETIME_SECONDS = 5 * 60;

export interface ImageKitConfig {
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

export function getImageKitConfig(): ImageKitConfig {
  return {
    publicKey: requiredEnvironmentValue("IMAGEKIT_PUBLIC_KEY"),
    privateKey: requiredEnvironmentValue("IMAGEKIT_PRIVATE_KEY"),
    urlEndpoint: requiredEnvironmentValue("IMAGEKIT_URL_ENDPOINT").replace(
      /\/+$/,
      "",
    ),
  };
}

export function isImageKitUrl(value: string): boolean {
  try {
    const endpoint = new URL(getImageKitConfig().urlEndpoint);
    const candidate = new URL(value);
    const endpointPath = endpoint.pathname.replace(/\/+$/, "");
    return (
      candidate.protocol === endpoint.protocol &&
      candidate.host === endpoint.host &&
      (candidate.pathname === endpointPath ||
        candidate.pathname.startsWith(`${endpointPath}/`))
    );
  } catch {
    return false;
  }
}

export function createImageKitUploadCredentials() {
  const config = getImageKitConfig();
  const token = randomUUID();
  const expire =
    Math.floor(Date.now() / 1000) + UPLOAD_CREDENTIAL_LIFETIME_SECONDS;
  const signature = createHmac("sha1", config.privateKey)
    .update(`${token}${expire}`)
    .digest("hex");

  return {
    token,
    expire,
    signature,
    publicKey: config.publicKey,
    urlEndpoint: config.urlEndpoint,
  };
}
