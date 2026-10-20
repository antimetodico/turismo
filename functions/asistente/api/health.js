import gesellgoWorker from "../../../lib/gesellgo-worker.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Use GET for this endpoint." }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  const targetUrl = new URL(context.request.url);
  targetUrl.pathname = "/api/health";
  return gesellgoWorker.fetch(new Request(targetUrl.toString(), context.request), context.env);
}
