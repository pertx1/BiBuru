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
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
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
