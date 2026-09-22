import { env } from "./env";

export function isImageKitUrl(value: string): boolean {
  try {
    const endpoint = new URL(env.imageKitUrlEndpoint);
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
