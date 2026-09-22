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

function readImageKitUrlEndpoint(): string {
  const value = requiredEnvironmentValue("IMAGEKIT_URL_ENDPOINT");

  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("IMAGEKIT_URL_ENDPOINT must be a valid URL.");
  }

  if (endpoint.protocol !== "https:") {
    throw new Error("IMAGEKIT_URL_ENDPOINT must use HTTPS.");
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      "IMAGEKIT_URL_ENDPOINT cannot include credentials, a query, or a fragment.",
    );
  }

  const endpointPath = endpoint.pathname.replace(/\/+$/, "");
  return `${endpoint.origin}${endpointPath}`;
}

export function getImageKitConfig(): ImageKitConfig {
  return {
    publicKey: requiredEnvironmentValue("IMAGEKIT_PUBLIC_KEY"),
    privateKey: requiredEnvironmentValue("IMAGEKIT_PRIVATE_KEY"),
    urlEndpoint: readImageKitUrlEndpoint(),
  };
}

export function isImageKitUrl(value: string): boolean {
  try {
    const endpoint = new URL(getImageKitConfig().urlEndpoint);
    const candidate = new URL(value);
    const endpointPath = endpoint.pathname.replace(/\/+$/, "");
    const assetPathPrefix = `${endpointPath}/`;
    const assetPath = candidate.pathname.slice(assetPathPrefix.length);
    return (
      candidate.protocol === endpoint.protocol &&
      candidate.host === endpoint.host &&
      candidate.pathname.startsWith(assetPathPrefix) &&
      assetPath.split("/").some(Boolean)
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
