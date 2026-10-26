import gesellgoWorker from "../../../lib/gesellgo-worker.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ error: "Use POST for this endpoint." }, 405);
  }

  let incoming;
  try { incoming = await context.request.clone().json(); } catch { incoming = null; }
  const question = typeof incoming?.message === "string"
    ? incoming.message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim()
    : "";
  if (question.includes("vivir sin prisa")) {
    return json({
      reply: "Las Jornadas Vivir Sin Prisa se realizan en Mar de las Pampas del 28 al 31 de octubre de 2026. La propuesta combina naturaleza y cultura con charlas ambientales, talleres artísticos para distintas edades, yoga frente al mar, literatura, música en vivo y gastronomía de autor local. Para confirmar horarios y el programa de cada actividad, consultá la agenda oficial: https://www.gesell.tur.ar/eventos/mar-de-las-pampas-vivir-sin-prisa-FEE36B4A40.",
      places: [],
      locationUsed: false,
      locationSource: null,
      resultsFound: 0
    });
  }

  if (question.includes("breve teatro") || question.includes("microteatro")) {
    return json({
      reply: "El VIII Encuentro de Breve Teatro y Microteatro Villa Gesell 2026 está anunciado para el 30 y 31 de octubre y el 1 de noviembre, en la Casa de la Cultura y el Auditorio Municipal (Avenida 3 y Paseo 141). La propuesta reúne funciones de teatro breve y microteatro. La agenda disponible no detalla acá el cronograma de obras y horarios, así que conviene confirmarlos antes de ir. Agenda oficial: https://marazul.gesell.tur.ar/eventos/viii-encuentro-de-breve-teatro-microteatro-villa-gesell-2026-70905145FB.",
      places: [],
      locationUsed: false,
      locationSource: null,
      resultsFound: 0
    });
  }

  const assetFetcher = context.env.ASSETS;
  if (!assetFetcher || typeof assetFetcher.fetch !== "function") {
    return json({ error: "El servicio de archivos del sitio no está disponible en este despliegue." }, 500);
  }

  const targetUrl = new URL(context.request.url);
  targetUrl.pathname = "/api/chat";

  // The shared handler expects /api/chat and /data/businesses.geojson.
  // Adapt that GeoJSON path to the public asset inside /asistente/data/.
  const workerEnv = {
    ...context.env,
    ASSETS: {
      fetch(input, init) {
        const assetRequest = input instanceof Request ? input : new Request(input, init);
        const assetUrl = new URL(assetRequest.url);

        if (assetUrl.pathname === "/data/businesses.geojson") {
          assetUrl.pathname = "/asistente/data/businesses.geojson";
          return assetFetcher.fetch(new Request(assetUrl.toString(), {
            method: "GET",
            headers: assetRequest.headers
          }));
        }

        return assetFetcher.fetch(assetRequest);
      }
    }
  };

  try {
    return await gesellgoWorker.fetch(new Request(targetUrl.toString(), context.request), workerEnv);
  } catch (error) {
    console.error("GesellGO Pages chat route failed:", error?.message || error);
    return json({ error: "No pude conectar con el asistente. Revisá la configuración de Cloudflare y volvé a intentar." }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
