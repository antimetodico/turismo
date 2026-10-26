const AGENDA_BASE = "https://www.gesell.tur.ar";
const AGENDA_PATH = "/eventos";

export async function onRequest({ request }) {
  if (request.method !== "GET") return json({ error: "Use GET for this endpoint." }, 405);
  // The agenda filters are client-side only; the canonical page already contains
  // all event cards. Query parameters can make the upstream response omit them.
  const agendaUrl = new URL(AGENDA_PATH, AGENDA_BASE);

  try {
    const upstream = await fetch(agendaUrl.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "es-AR,es;q=0.9,en;q=0.7", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Referer": "https://www.gesell.tur.ar/" },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!upstream.ok) throw new Error("Agenda returned HTTP " + upstream.status);
    const source = await upstream.text();
    const events = await parseAgenda(source);
    if (!events.length) { const starts = (source.match(/<div\b[^>]*box-eventos-interno/gi) || []).length; throw new Error("No events extracted (html=" + source.length + ", hasCardMarker=" + source.includes("box-eventos-interno") + ", cardStarts=" + starts + ")"); }
    return json({
      source: agendaUrl.toString(),
      updatedAt: new Date().toISOString(),
      events: events.slice(0, 18)
    }, 200, {
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=3600"
    });
  } catch (error) {
    console.error("GesellGO event agenda refresh failed:", error?.message || error);
    return json({ error: "No se pudo actualizar la agenda oficial.", reason: String(error?.message || error).slice(0, 180) }, 502, { "Cache-Control": "no-store" });
  }
}

async function parseAgenda(source) {
  // The tourism page embeds all event cards in its HTML. Parse the card blocks
  // directly so this works in Pages Functions without a browser or JS runtime.
  const html = source
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const blocks = extractEventCardBlocks(html);
  const today = argentinaDateKey(new Date());
  const seen = new Set();
  const events = [];

  for (const block of blocks) {
    const heading = (block.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i) || [])[1] || "";
    const title = cleanText(heading);
    const href = (block.match(/<h4\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i) || [])[1]
      || (block.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) || [])[1]
      || "";
    const detailUrl = safeAgendaUrl(href);
    const paragraphs = [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(match => cleanText(match[1]))
      .filter(Boolean);
    const dateParagraph = paragraphs.find(value => /\d{1,2}\s+de\s+[\p{L}]+\s+de\s+\d{4}/iu.test(value)) || "";
    const dateParts = parseDate(dateParagraph || cleanText(block));
    if (!title || !detailUrl || !dateParts || dateParts.key < today) continue;

    const locationParagraph = paragraphs.find(value =>
      value !== dateParagraph &&
      value !== title &&
      !/\d{1,2}\s+de\s+[\p{L}]+\s+de\s+\d{4}/iu.test(value) &&
      !/ver m[aá]s|compartir|informaci[oó]n del evento/i.test(value)
    );
    const location = cleanText(locationParagraph || "") || "Villa Gesell";
    const imageTag = block.match(/<(?:img|source)\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const styleMatches = [...block.matchAll(/\bstyle=["']([^"']+)["']/gi)];
    let image = imageTag ? safeImageUrl(imageTag[1]) : "";
    if (!image) {
      for (const match of styleMatches) {
        image = extractBackgroundImage(match[1]);
        if (image) break;
      }
    }
    if (!image) continue;

    const key = normalize(title);
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      id: key,
      title,
      dateText: dateParts.dateText,
      dateLabel: dateParts.dateLabel,
      date: dateParts.key,
      location,
      image,
      url: detailUrl
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.dateLabel.localeCompare(b.dateLabel));
  return events;
}

function extractEventCardBlocks(html) {
  const blocks = [];
  const cardStart = /<div\b[^>]*class=["'][^"']*\bbox-eventos-interno\b[^"']*["'][^>]*>/gi;
  let match;
  while ((match = cardStart.exec(html))) {
    const blockStart = match.index;
    const tagScanner = /<\/?div\b[^>]*>/gi;
    tagScanner.lastIndex = cardStart.lastIndex;
    let depth = 1;
    let tag;
    while ((tag = tagScanner.exec(html))) {
      if (/^<\/div/i.test(tag[0])) depth--;
      else if (!/\/\s*>$/.test(tag[0])) depth++;
      if (depth === 0) {
        blocks.push(html.slice(blockStart, tagScanner.lastIndex));
        cardStart.lastIndex = tagScanner.lastIndex;
        break;
      }
    }
  }
  return blocks;
}
function parseDate(value) {
  const text = cleanText(value);
  const match = text.match(/(\d{1,2})\s+de\s+([\p{L}]+)\s+de\s+(\d{4})(?:\s+(\d{1,2}:\d{2})\s*Hs?\.?)?/iu);
  if (!match) return null;
  const months = { enero:"01", febrero:"02", marzo:"03", abril:"04", mayo:"05", junio:"06", julio:"07", agosto:"08", septiembre:"09", setiembre:"09", octubre:"10", noviembre:"11", diciembre:"12" };
  const month = months[normalize(match[2])];
  if (!month) return null;
  const day = String(Number(match[1])).padStart(2, "0");
  const key = match[3] + "-" + month + "-" + day;
  const time = match[4] ? " · " + match[4] + " hs." : "";
  return { key, dateText: match[0], dateLabel: Number(match[1]) + " de " + capitalize(match[2]) + " de " + match[3] + time };
}

function safeAgendaUrl(value) {
  try {
    const url = new URL(value, AGENDA_BASE);
    return url.origin === AGENDA_BASE && /^\/eventos\/[a-z0-9-]+$/i.test(url.pathname) ? url.href : "";
  } catch { return ""; }
}

function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, AGENDA_BASE);
    return url.origin === AGENDA_BASE && /^\/image\//i.test(url.pathname) ? url.href : "";
  } catch { return ""; }
}

function extractBackgroundImage(style) {
  const match = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
  return match ? safeImageUrl(match[1]) : "";
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/\s+/g, " ").trim();
}
function normalize(value) { return cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function capitalize(value) { const text = cleanText(value).toLowerCase(); return text.charAt(0).toUpperCase() + text.slice(1); }
function argentinaDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...extraHeaders }
  });
}
