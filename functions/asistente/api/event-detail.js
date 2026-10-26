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
    const page = html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
    const title = decodeHtml(firstMatch(page, [
      /<h3\b[^>]*>([\s\S]*?)<\/h3>/i,
      /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i,
      /<title\b[^>]*>([\s\S]*?)<\/title>/i
    ])).split(/\s*::\s*/)[0].trim();
    const descriptionMeta = firstMatch(page, [
      /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
      /<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i,
      /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i
    ]);
    const imageMeta = firstMatch(page, [
      /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
      /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i
    ]);
    const infoIndex = page.search(/Información del evento/i);
    const infoTail = infoIndex >= 0 ? page.slice(infoIndex) : page;
    const paragraphs = [...infoTail.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(match => cleanText(decodeHtml(match[1])))
      .filter(value => value && !/^(próximos eventos|información del evento|compartir|ver más)$/i.test(value));
    const location = paragraphs[0] || "";
    const descriptionParts = paragraphs.slice(1).filter(value =>
      value.length > 35 && !/^(desde|hasta|horario)\s*:/i.test(value) && !/ir a la web del evento/i.test(value)
    );
    const description = descriptionParts.slice(0, 3).join(" ") || cleanText(decodeHtml(descriptionMeta));
    const from = cleanText(decodeHtml((page.match(/Desde\s*:\s*(?:<[^>]+>\s*)*([^<\r\n]+)/i) || [])[1] || ""));
    const until = cleanText(decodeHtml((page.match(/Hasta\s*:\s*(?:<[^>]+>\s*)*([^<\r\n]+)/i) || [])[1] || ""));
    const time = cleanText(decodeHtml((page.match(/Horario\s*:\s*(?:<[^>]+>\s*)*([^<\r\n]+)/i) || [])[1] || ""));
    let dateLabel = from || "";
    if (until && normalize(until) !== normalize(from)) dateLabel = from + " al " + until;
    if (time) dateLabel += (dateLabel ? " · " : "") + time;
    const firstEventImage = (page.match(/<(?:img|source)\b[^>]*(?:src|data-src)=["']([^"']*\/image\/[^"']+)["']/i) || [])[1] || "";
    const image = safeImageUrl(decodeHtml(imageMeta)) || safeImageUrl(decodeHtml(firstEventImage));
    return json({
      title: title || "Evento",
      description: description.slice(0, 1000),
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

function firstMatch(source, patterns) {
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match && match[1]) return match[1];
  }
  return "";
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
