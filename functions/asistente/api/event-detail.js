const AGENDA_BASE = "https://www.gesell.tur.ar";

export async function onRequest({ request }) {
  if (request.method !== "GET") return json({ error: "Use GET for this endpoint." }, 405);
  const requested = new URL(request.url).searchParams.get("url");
  const eventUrl = safeEventUrl(requested);
  if (!eventUrl) return json({ error: "Invalid event URL." }, 400);

  try {
    const upstream = await fetch(eventUrl, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!upstream.ok) throw new Error("Event detail returned HTTP " + upstream.status);
    const html = await upstream.text();
    const title = decodeHtml((html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i) || [])[1] || "");
    const descriptionMeta = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1]
      || (html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1]
      || (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) || [])[1]
      || "";
    const imageMeta = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || [])[1] || "";
    const infoIndex = html.search(/Horario\s*:/i);
    const infoTail = infoIndex >= 0 ? html.slice(infoIndex) : html;
    const paragraphs = [...infoTail.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(match => cleanText(decodeHtml(match[1]))).filter(Boolean);
    const location = paragraphs[0] || "";
    const description = cleanText(decodeHtml(descriptionMeta)) || paragraphs.slice(1).find(value => value.length > 45) || "";
    const from = cleanText(decodeHtml((html.match(/Desde\s*:\s*([^<\r\n]+)/i) || [])[1] || ""));
    const until = cleanText(decodeHtml((html.match(/Hasta\s*:\s*([^<\r\n]+)/i) || [])[1] || ""));
    const time = cleanText(decodeHtml((html.match(/Horario\s*:\s*([^<\r\n]+)/i) || [])[1] || ""));
    let dateLabel = from || "";
    if (until && normalize(until) !== normalize(from)) dateLabel = from + " al " + until;
    if (time) dateLabel += (dateLabel ? " · " : "") + time;
    const firstEventImage = (html.match(/<img[^>]+src=["']([^"']*\/image\/[^"']+)["']/i) || [])[1] || "";
    const image = safeImageUrl(decodeHtml(imageMeta)) || safeImageUrl(decodeHtml(firstEventImage));
    return json({
      title: title || "Evento",
      description: description.slice(0, 700),
      dateLabel: dateLabel || "",
      location: location.slice(0, 260),
      image,
      url: eventUrl
    }, 200, { "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=3600" });
  } catch (error) {
    console.error("GesellGO event detail fetch failed:", error?.message || error);
    return json({ error: "No se pudo cargar el detalle del evento." }, 502, { "Cache-Control": "no-store" });
  }
}

function safeEventUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, AGENDA_BASE);
    return (url.hostname === "www.gesell.tur.ar" || url.hostname.endsWith(".gesell.tur.ar"))
      && /^\/eventos\/[a-z0-9-]+$/i.test(url.pathname) ? url.href : "";
  } catch { return ""; }
}
function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, AGENDA_BASE);
    return (url.hostname === "www.gesell.tur.ar" || url.hostname.endsWith(".gesell.tur.ar"))
      && /^\/image\//i.test(url.pathname) ? url.href : "";
  } catch { return ""; }
}
function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/\s+/g, " ").trim();
}
function decodeHtml(value) { return cleanText(value); }
function normalize(value) { return cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); }
