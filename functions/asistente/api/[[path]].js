// /asistente/api/chat and /asistente/api/health have their own route files, which
// Pages matches first. This catch-all only answers unknown API paths.
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export async function onRequest() {
  return new Response(JSON.stringify({ error: "Endpoint not found." }), {
    status: 404,
    headers: JSON_HEADERS
  });
}
