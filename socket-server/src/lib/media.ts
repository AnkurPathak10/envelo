import { env } from "./env";

export function isImageKitUrl(value: string): boolean {
  try {
    const endpoint = new URL(env.imageKitUrlEndpoint);
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

export function isGiphyUrl(value: string): boolean {
  try {
    const candidate = new URL(value);
    return (
      candidate.protocol === "https:" &&
      /^(?:media\d*|i)\.giphy\.com$/i.test(candidate.hostname) &&
      candidate.pathname.split("/").some(Boolean)
    );
  } catch {
    return false;
  }
}

export function isAllowedMediaUrl(value: string): boolean {
  return isImageKitUrl(value) || isGiphyUrl(value);
}
