/** Trigger a client-side download of a Blob — no server round-trip, in keeping
 * with the rest of the app (nothing leaves the device). */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // Revoke after the click is handled, not synchronously (racy for large blobs).
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
