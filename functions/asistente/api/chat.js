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
