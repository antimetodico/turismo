# GESELL · Villa Gesell landing page

Static tourism landing page built with HTML, CSS and JavaScript. There is no build step or application server.

## Structure

```
index.html        Page markup and navigation controls
css/styles.css    Layout, typography, animations and responsive styling
js/app.js         Pannellum setup, motion control, subtitle rotation and map overlay
images/           360° panorama (gesell-360.jpg) and static fallback photo (bg-1.webp)
fonts/            Gotham Black, Book and Bold (the only weights the site uses)
asistente/        GesellGO chat UI and guide GeoJSON
functions/        Same-origin Pages Functions: /asistente/api/chat and /asistente/api/health (other API paths return 404)
lib/              Shared server-side GesellGO handler
_headers          Cloudflare Pages security headers, CSP and cache rules
```

## Panorama

The hero uses Pannellum 2.5.7 from jsDelivr and loads `images/gesell-360.jpg`. Visitors can drag the panorama with a mouse or touch screen. On supported mobile browsers, **Activar movimiento** requests device-orientation control. Dragging remains available if motion permission or support is unavailable.

If Pannellum's JavaScript fails to load, the page displays `images/bg-1.webp` with the GESELL title and first subtitle as a static fallback.

The subtitle rotates through the strings in `SUBTITLES` at the top of `js/app.js`. Rotation is disabled when the operating system requests reduced motion.

## Map

The map is a uMap iframe that loads on first open. Update the URL in both `data-src` and the `.map-link` in `index.html` if you replace the map. The iframe URL gets a cache-busting query parameter on first load; if you edit the map while the page is already open, reload the page before checking the changes.

## GesellGO assistant

The ASISTENTE control opens `/asistente/` on this same site. Its frontend assets live in `asistente/`, and `functions/asistente/api/chat.js` and `health.js` route to the server-side handler in `lib/gesellgo-worker.js`. The chat function adapts the GeoJSON path to `asistente/data/businesses.geojson`, keeping the chat API and interface on the Turismo origin.

## Security and secrets

This site is static and must not contain API keys, credentials or private tokens. Set `GEMINI_API_KEY` as a **Secret** in the Turismo Cloudflare Pages project under Settings → Variables and Secrets, for Production (and Preview too if you test preview deployments). Do not commit it or place it in HTML or frontend JavaScript. The handler calls `gemini-3.8-flash` first with thinking level `low` and automatically retries on `gemini-3.6-flash` with thinking level `minimal` if Gemini returns a transient HTTP 502, 503, or 504. These levels are model-specific because Gemini 3.8 Flash rejects `minimal`. See Google's [thinking-level documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking) before changing them.

The `_headers` file defines the Content Security Policy, browser permissions and caching rules. Geolocation is allowed for this origin because GesellGO requests a visitor's location only after the visitor presses its location button and grants browser permission.

## Deploy with Cloudflare Pages

1. Connect the repository to Cloudflare Pages.
2. Leave the build command empty.
3. Set the build output directory to the repository root (`/` or `.`, depending on the dashboard field).
4. Keep the project connected to the repository root so Cloudflare discovers the root `functions/` directory. Set `GEMINI_API_KEY` as described above, then deploy. Pushes to `main` trigger production deployment when the project is configured to use `main`.

## Local preview

Run `python3 -m http.server 8000` in the project directory, then open `http://localhost:8000` to preview the static pages. The chat API requires Cloudflare Pages Functions and a configured `GEMINI_API_KEY`, so it will not work through Python's static server alone.
