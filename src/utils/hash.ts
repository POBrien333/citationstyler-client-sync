/** Hex-encoded SHA-256 of a UTF-8 string. */
export async function sha256Hex(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
