// Mini "Supabase" local para pruebas manuales (no forma parte de CI):
//   /rest/v1 -> PostgREST (3001), /auth/v1/user -> usuario del JWT, /auth/v1/admin/users -> lista de usuarios.
// Ver scripts/e2e/README.md
import http from "node:http";
import crypto from "node:crypto";
const SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
const verify = (t) => {
  const [h, p, s] = t.split(".");
  const sig = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (sig !== s) return null;
  return JSON.parse(Buffer.from(p, "base64url").toString());
};
// Storage mínimo en memoria (subir, descargar, URL firmada, copiar y borrar), sin permisos: solo para scripts/e2e.
const files = new Map();
const sign = (key) => crypto.createHmac("sha256", SECRET).update(key).digest("base64url");
const body = (req) => new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });
const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
async function storage(req, res, url) {
  const p = decodeURIComponent(url.pathname.slice("/storage/v1".length));
  if (p.startsWith("/object/sign/")) {
    const key = p.slice("/object/sign/".length);
    if (req.method === "POST") return json(res, 200, { signedURL: `/object/sign/${key}?token=${sign(key)}` });
    if (url.searchParams.get("token") !== sign(key) || !files.has(key)) return json(res, 400, { message: "bad token" });
    const f = files.get(key); res.writeHead(200, { "content-type": f.type, "content-length": f.data.length }); return res.end(f.data);
  }
  if (p === "/object/copy" && req.method === "POST") {
    const b = JSON.parse((await body(req)).toString()); const from = `${b.bucketId}/${b.sourceKey}`;
    if (!files.has(from)) return json(res, 404, { message: "not found" });
    files.set(`${b.bucketId}/${b.destinationKey}`, files.get(from)); return json(res, 200, { Key: `${b.bucketId}/${b.destinationKey}` });
  }
  if (p.startsWith("/object/") && req.method === "DELETE") {
    const bucket = p.slice("/object/".length); const b = JSON.parse((await body(req)).toString());
    const gone = (b.prefixes ?? []).filter((k) => files.delete(`${bucket}/${k}`)); return json(res, 200, gone.map((name) => ({ name })));
  }
  const key = p.replace(/^\/object\/(authenticated\/)?/, "");
  if (req.method === "POST" || req.method === "PUT") { files.set(key, { data: await body(req), type: req.headers["content-type"] ?? "application/octet-stream" }); return json(res, 200, { Key: key, Id: crypto.randomUUID() }); }
  if (req.method === "GET") { const f = files.get(key); if (!f) return json(res, 404, { message: "not found" }); res.writeHead(200, { "content-type": f.type }); return res.end(f.data); }
  if (req.method === "HEAD") { res.writeHead(files.has(key) ? 200 : 404); return res.end(); }
  return json(res, 404, {});
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/storage/v1/")) { // CORS como el Supabase real (el navegador sube directo al almacenamiento)
    res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
    res.setHeader("access-control-allow-headers", "authorization, apikey, content-type, x-client-info, x-upsert, cache-control, x-supabase-api-version");
    res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, HEAD, OPTIONS");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  }
  if (url.pathname === "/storage/v1/__files") return json(res, 200, [...files.keys()]);
  if (url.pathname.startsWith("/storage/v1/")) return void storage(req, res, url).catch((e) => json(res, 500, { message: String(e) }));
  if (url.pathname === "/auth/v1/admin/users") {
    const tok = (req.headers.authorization ?? "").replace("Bearer ", "");
    const c = tok && verify(tok);
    if (!c || c.role !== "service_role") { res.writeHead(403, { "content-type": "application/json" }); return res.end('{"msg":"forbidden"}'); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ users: JSON.parse(process.env.MOCK_USERS ?? "[]"), aud: "authenticated" }));
  }
  if (url.pathname === "/auth/v1/user") {
    const tok = (req.headers.authorization ?? "").replace("Bearer ", "");
    const c = tok && verify(tok);
    if (!c) { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"msg":"bad jwt"}'); }
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ id: c.sub, aud: "authenticated", role: "authenticated", email: c.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }));
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const path = url.pathname.slice("/rest/v1".length) + url.search;
    const headers = { ...req.headers, host: "localhost:3001" };
    // Como el gateway real de Supabase: una clave "publishable" (no es un JWT) equivale a rol anónimo.
    const bearer = (headers.authorization ?? "").replace("Bearer ", "");
    if (bearer && !verify(bearer)) delete headers.authorization;
    const p = http.request({ host: "localhost", port: 3001, path, method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on("error", (e) => { res.writeHead(502); res.end(String(e)); });
    return req.pipe(p);
  }
  res.writeHead(404); res.end("{}");
}).listen(54321, () => console.log("mock supabase on 54321"));
