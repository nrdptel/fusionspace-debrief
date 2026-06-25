// Share a flight as a link without a server. The original file is packed into the
// URL's #fragment — gzipped (via the browser's CompressionStream) and base64url-
// encoded — so a second browser can decode and re-analyze it entirely on-device.
// The fragment is never sent to any server, so this keeps the privacy promise:
// the flight rides inside the link itself, not through a backend.

interface SharePayload {
  n: string; // file name
  t: string; // raw file text
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const hasCompression = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  // Runtime data is always ArrayBuffer-backed; the cast satisfies the stricter
  // Uint8Array<ArrayBuffer> stream-writer signature in current lib.dom.
  writer.write(bytes as Uint8Array<ArrayBuffer>);
  writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes as Uint8Array<ArrayBuffer>);
  writer.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/** Encode a flight file into a fragment payload (a leading flag marks gzip). */
export async function encodeFlight(name: string, text: string): Promise<string> {
  const json = JSON.stringify({ n: name, t: text } satisfies SharePayload);
  const raw = new TextEncoder().encode(json);
  if (hasCompression) {
    return '1' + bytesToBase64Url(await gzip(raw));
  }
  return '0' + bytesToBase64Url(raw);
}

/** Decode a fragment payload back into a flight file, or null if it's unreadable. */
export async function decodeFlight(payload: string): Promise<{ name: string; text: string } | null> {
  try {
    const flag = payload[0];
    let bytes = base64UrlToBytes(payload.slice(1));
    if (flag === '1') bytes = await gunzip(bytes);
    const obj = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload;
    if (typeof obj?.t !== 'string') return null;
    return { name: typeof obj.n === 'string' ? obj.n : 'shared-flight', text: obj.t };
  } catch {
    return null;
  }
}

/** The fragment payload from a URL hash, if present (`#f=…`). */
export function payloadFromHash(hash: string): string | null {
  const m = hash.match(/[#&]f=([^&]+)/);
  return m ? m[1] : null;
}

/** Build a shareable absolute URL carrying the flight in its fragment. */
export function shareUrl(origin: string, pathname: string, payload: string): string {
  return `${origin}${pathname}#f=${payload}`;
}

// A link much longer than this is rejected by some apps/browsers when shared, so
// we warn rather than hand back something that silently breaks.
export const MAX_SHARE_URL = 16000;
