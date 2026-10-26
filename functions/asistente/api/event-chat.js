export async function onRequest({ request }) {
  if (request.method !== "POST") return json({ error: "Use POST for this endpoint." }, 405);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "La solicitud no contiene JSON válido." }, 400); }

  const supplied = body?.event && typeof body.event === "object" ? body.event : {};
  const suppliedDescription = safeText(supplied.description, 1200);
  const event = {
    title: safeText(supplied.title, 180) || "Evento en Villa Gesell",
    description: suppliedDescription,
    date: safeText(supplied.date, 180) || "Fecha a confirmar en la agenda oficial",
    location: safeText(supplied.location, 240) || "Villa Gesell",
    url: safeEventUrl(supplied.url) || "https://www.gesell.tur.ar/eventos"
  };

  // The app already supplies the official event details. Compose the response
  // deterministically so a model greeting or incomplete generation cannot replace them.
  const description = event.description
    ? event.description + " "
    : "La agenda no ofrece una descripción más extensa por el momento. ";
  const reply = event.title + " está anunciado para " + event.date + " en " + event.location + ". "
    + description
    + "Para confirmar horarios, programación y posibles cambios, consultá la agenda oficial: "
    + event.url + ".";

  return json({ reply }, 200, { "Cache-Control": "no-store" });
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
