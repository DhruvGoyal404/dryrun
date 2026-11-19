// Share links: the code, input and options, deflated and base64url-encoded into the URL
// fragment. The fragment never reaches a server. Decoding treats the fragment as untrusted:
// every field is type-checked and size-limited, and anything else is a friendly error.

export interface Shared {
  code: string;
  mode: "stdin" | "call";
  stdin: string;
  call: string;
  /** Compare mode's second solution, when sharing a comparison. */
  codeB?: string;
}

/** Longest fragment we create or accept; links beyond it break in chat apps and some browsers. */
export const MAX_FRAGMENT = 16_000;
const MAX_FIELD = 50_000;
const VERSION = 1;

export class ShareError extends Error {}

const toBase64Url = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string) => {
  const bin = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of out as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > limit) throw new ShareError("This link expands to more than DryRun accepts.");
    chunks.push(chunk);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return all;
}

export async function encode(data: Shared): Promise<string> {
  const json = JSON.stringify({ v: VERSION, ...data });
  const packed = toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw")));
  if (packed.length > MAX_FRAGMENT) {
    throw new ShareError(
      `This program is too long to share as a link (${packed.length.toLocaleString("en")} characters after compression; the limit is ${MAX_FRAGMENT.toLocaleString("en")}). Shorten the code or the input.`,
    );
  }
  return `s=${packed}`;
}

const str = (v: unknown, name: string) => {
  if (typeof v !== "string") throw new ShareError(`This link is damaged (${name} is missing).`);
  if (v.length > MAX_FIELD) throw new ShareError(`This link's ${name} is too long.`);
  return v;
};

/** Reads `#s=...`. Returns null when the fragment isn't a share link at all. */
export async function decode(fragment: string): Promise<Shared | null> {
  const m = /^#?s=([A-Za-z0-9_-]+)$/.exec(fragment);
  if (!m) return null;
  if (m[1]!.length > MAX_FRAGMENT) throw new ShareError("This link is longer than DryRun accepts.");
  let parsed: Record<string, unknown>;
  try {
    const bytes = await pipe(fromBase64Url(m[1]!), new DecompressionStream("deflate-raw"), MAX_FIELD * 4);
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ShareError) throw error;
    throw new ShareError("This link is damaged: it could not be decoded. Ask for a fresh one.");
  }
  if (typeof parsed !== "object" || parsed === null || parsed.v !== VERSION) {
    throw new ShareError("This link was made by a different version of DryRun.");
  }
  const mode = parsed.mode === "call" ? "call" : "stdin";
  return {
    code: str(parsed.code, "code"),
    mode,
    stdin: str(parsed.stdin ?? "", "input"),
    call: str(parsed.call ?? "", "call"),
    ...(parsed.codeB !== undefined ? { codeB: str(parsed.codeB, "second solution") } : {}),
  };
}
