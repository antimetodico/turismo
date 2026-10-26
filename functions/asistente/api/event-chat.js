const PRIMARY_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.6-flash";

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ error: "Use POST for this endpoint." }, 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Falta configurar GEMINI_API_KEY." }, 503);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "La solicitud no contiene JSON válido." }, 400); }

  const supplied = body?.event && typeof body.event === "object" ? body.event : {};
  const event = {
    title: safeText(supplied.title, 180) || "Evento en Villa Gesell",
    description: safeText(supplied.description, 1200) || "La agenda oficial no ofrece una descripción más extensa.",
    date: safeText(supplied.date, 180) || "Fecha a confirmar en la agenda oficial",
    location: safeText(supplied.location, 240) || "Villa Gesell",
    url: safeEventUrl(supplied.url) || "https://www.gesell.tur.ar/eventos"
  };

  const prompt = [
    "Sos GesellGO, guía turística de Villa Gesell, Argentina. Respondé en español rioplatense natural, breve y útil, en uno o dos párrafos. Explicá de qué se trata el evento usando la descripción disponible e incluí claramente fecha y lugar. No inventes horarios, precios, actividades, entradas ni datos que no estén en el contexto. Si un dato falta, decí que se debe confirmar en la agenda oficial. No uses listas, títulos ni Markdown.",
    "Evento: " + event.title,
    "Descripción publicada: " + event.description,
    "Fecha publicada: " + event.date,
    "Lugar publicado: " + event.location,
    "Página oficial: " + event.url
  ].join("\n");

  let lastStatus = 502;
  for (const model of [PRIMARY_MODEL, FALLBACK_MODEL]) {
    try {
      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.45, maxOutputTokens: 280 }
          })
        }
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const reply = (data?.candidates?.[0]?.content?.parts || [])
          .map(part => typeof part.text === "string" ? part.text : "")
          .join("\n").trim();
        if (reply) return json({ reply }, 200, { "Cache-Control": "no-store" });
      }
      lastStatus = response.status || 502;
      console.error("GesellGO event AI model failed", model, lastStatus);
    } catch (error) {
      console.error("GesellGO event AI request failed", model, error?.message || error);
    }
  }

  return json({
    error: lastStatus === 429
      ? "El asistente alcanzó temporalmente el límite de consultas."
      : "No se pudo generar una respuesta para este evento."
  }, lastStatus === 429 ? 429 : 502);
}

function safeText(value, maxLength) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}
function safeEventUrl(value) {
  try {
    const url = new URL(value);
    return (url.hostname === "www.gesell.tur.ar" || url.hostname.endsWith(".gesell.tur.ar"))
      && /^\/eventos\/[a-z0-9-]+$/i.test(url.pathname) ? url.href : "";
  } catch { return ""; }
}
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    }
  });
}
