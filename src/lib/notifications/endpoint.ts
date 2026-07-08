// Push endpoint validation at the write boundary. Real push services are
// always https; http is permitted only for localhost so a local dev push
// service still works. Pure so it's unit-testable without the server action.

/** Real push service URLs are a few hundred chars; anything past this is junk. */
export const MAX_PUSH_ENDPOINT_LENGTH = 2000;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function isValidPushEndpoint(endpoint: string): boolean {
  if (!endpoint || endpoint.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOCAL_HOSTNAMES.has(url.hostname);
}
