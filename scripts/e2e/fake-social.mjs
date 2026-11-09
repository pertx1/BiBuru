// Instagram y TikTok falsos para scripts/e2e/social-publish.mjs (la app los usa con SOCIAL_API_TEST_BASE=http://localhost:9700).
// Imitan las respuestas de las APIs oficiales y cuentan las llamadas para comprobar que nada se publica dos veces.
import http from "node:http";

const state = { quota: 0, failNext: null, igContainers: [], igPublished: [], ttInits: [], ttUploads: [], downloads: [] };
const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  if (p === "/control") { // ?quota=50&fail=2207026&reset=1
    if (url.searchParams.has("reset")) Object.assign(state, { quota: 0, failNext: null, igContainers: [], igPublished: [], ttInits: [], ttUploads: [], downloads: [] });
    if (url.searchParams.has("quota")) state.quota = Number(url.searchParams.get("quota"));
    if (url.searchParams.has("fail")) state.failNext = Number(url.searchParams.get("fail"));
    return json(res, 200, state);
  }
  // ---------------- Instagram (graph.instagram.com/v23.0/…)
  if (p.startsWith("/graph.instagram.com/")) {
    const parts = p.split("/").slice(3); // [igUser, "media"] …
    if (parts[1] === "content_publishing_limit") return json(res, 200, { data: [{ quota_usage: state.quota, config: { quota_total: 50, quota_duration: 86400 } }] });
    if (parts[1] === "media" && req.method === "POST") {
      const f = new URLSearchParams((await body(req)).toString());
      if (state.failNext) { const sub = state.failNext; state.failNext = null; return json(res, 400, { error: { message: "The video file you selected is in a format that we don't support.", type: "OAuthException", code: 9004, error_subcode: sub } }); }
      // Como Instagram: descarga el archivo de la URL firmada.
      const media = await fetch(f.get("video_url") ?? f.get("image_url")).catch(() => null);
      const bytes = media?.ok ? (await media.arrayBuffer()).byteLength : 0;
      state.downloads.push(bytes);
      if (!bytes) return json(res, 400, { error: { message: "Media download has failed.", code: 9004, error_subcode: 2207052 } });
      const id = `c${state.igContainers.length + 1}`;
      state.igContainers.push({ id, caption: f.get("caption"), media_type: f.get("media_type") });
      return json(res, 200, { id });
    }
    if (parts[1] === "media_publish") {
      const f = new URLSearchParams((await body(req)).toString());
      const id = `m${state.igPublished.length + 1}`;
      state.igPublished.push({ id, container: f.get("creation_id") });
      return json(res, 200, { id });
    }
    if (url.searchParams.get("fields") === "status_code") return json(res, 200, { status_code: "FINISHED", id: parts[0] });
    if (url.searchParams.get("fields") === "permalink") return json(res, 200, { permalink: `https://www.instagram.com/reel/${parts[0]}/`, id: parts[0] });
    return json(res, 404, { error: { message: "fake: no route", code: 100 } });
  }
  // ---------------- TikTok
  if (p === "/open.tiktokapis.com/v2/post/publish/inbox/video/init/" || p === "/open.tiktokapis.com/v2/post/publish/video/init/") {
    const b = JSON.parse((await body(req)).toString());
    const id = `pt${state.ttInits.length + 1}`;
    state.ttInits.push({ id, mode: p.includes("inbox") ? "draft" : "direct", size: b.source_info?.video_size, title: b.post_info?.title ?? null });
    return json(res, 200, { data: { publish_id: id, upload_url: `https://open-upload.tiktokapis.com/upload/?id=${id}` }, error: { code: "ok", message: "" } });
  }
  if (p === "/open-upload.tiktokapis.com/upload/") { state.ttUploads.push((await body(req)).length); res.writeHead(201); return res.end(); }
  if (p === "/open.tiktokapis.com/v2/post/publish/status/fetch/") return json(res, 200, { data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok", message: "" } });
  json(res, 404, { error: { code: "not_found", message: `fake: ${p}` } });
}).listen(9700, () => console.log("fake social on 9700"));
