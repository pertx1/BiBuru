// Gemini falso para pruebas locales: responde con el formato real de la API y registra las peticiones.
import http from "node:http";

export function startFakeGemini(port = 9500) {
  const requests = [];
  const today = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const reply = (parts, tokens = [1200, 150]) => ({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: tokens[0], candidatesTokenCount: tokens[1], totalTokenCount: tokens[0] + tokens[1] } });
  const proposal = (o) => ({ confidence: 0.95, business: null, folder: null, date: null, time: null, end_time: null, priority: 0, tags: [], body: null, url: null, expense: null, order: null, goal: null, ...o });

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const system = body.systemInstruction?.parts?.map((p) => p.text).join("") ?? "";
      const last = body.contents?.at(-1);
      const userText = (body.contents ?? []).flatMap((c) => c.parts ?? []).map((p) => p.text ?? "").join("\n");
      requests.push({ url: req.url, system: system.slice(0, 80), body });
      if (!/:generateContent/.test(req.url ?? "")) { res.writeHead(404).end("{}"); return; }
      res.setHeader("Content-Type", "application/json");
      let out;
      if (system.includes("clasificador de capturas")) {
        const t = userText;
        out = /gasto|€|euros/i.test(t) ? proposal({ kind: "expense", title: "Gasto", business: "Akerra", date: today, confidence: 0.97, expense: { amount_eur: 42.5, concept: "Etiquetas", category: null, supplier: "Mercería", payment_method: null } })
          : /etiquetas/i.test(t) ? proposal({ kind: "task", title: "Comprar etiquetas para las camisetas", date: today, time: "09:00", business: "Akerra", tags: ["compras"] })
          : proposal({ kind: "note", title: "Idea de pack de verano", body: t, tags: ["idea"], confidence: 0.9 });
        out = reply([{ text: JSON.stringify(out) }]);
      } else if (system.includes("analista de vídeos")) {
        const light = /ligero/.test(system);
        out = reply([{ text: JSON.stringify({
          summary: light ? "Resumen ligero basado en el título." : "El vídeo explica cómo captar clientes para una marca de ropa con anuncios cortos. Compara formatos, muestra ejemplos de creatividades y propone un calendario semanal de pruebas.",
          key_points: ["Probar 3 creatividades por semana", "Medir coste por clic", "Reutilizar los mejores vídeos"], category: "marketing", tags: ["anuncios", "ropa"],
          actions: ["Preparar 3 anuncios cortos para Akerra", "Definir presupuesto de prueba"], business: "Akerra", business_reason: "Habla de captar clientes para marcas de ropa.", utility: 5 }) }], [60000, 400]);
      } else if (body.tools?.length) {
        const answered = last?.parts?.some((p) => p.functionResponse);
        out = answered ? reply([{ text: "Mañana tienes **1 tarea**: Comprar etiquetas para las camisetas (09:00)." }])
          : reply([{ functionCall: { name: "list_tasks", args: { from: today, to: today } } }]);
      } else out = reply([{ text: "ok" }]);
      res.end(JSON.stringify(out));
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ requests, close: () => server.close() })));
}
