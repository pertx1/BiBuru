import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Clave personal del conector de Claude: solo se guarda su hash (sha256) y se enseña una vez. */
export const hashMcpToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const MCP_TOKEN_RE = /^bm_[A-Za-z0-9_-]{30,60}$/;
export function newMcpToken() {
  const token = `bm_${randomBytes(30).toString("base64url")}`;
  return { token, hash: hashMcpToken(token) };
}
