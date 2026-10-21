/* GeoJSON map switcher for the Villa Gesell landing page. */
(() => {
  "use strict";

  const mapSection = document.getElementById("map");
  const mapToggle = document.getElementById("mapToggle");
  const panoramaToggle = document.getElementById("panoramaToggle");
  const hero = document.querySelector(".hero");
  const mapCanvas = document.getElementById("mapCanvas");
  const mapPicker = document.getElementById("mapPicker");
  const mapDock = document.getElementById("mapDock");
  const mapStatus = document.getElementById("mapStatus");
  const mapStatusText = document.getElementById("mapStatusText");
  const mapRetry = document.getElementById("mapRetry");
  let mapNotice = null;
  let mapNoticeTimer = null;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!mapSection || !mapToggle || !mapCanvas || !mapPicker || !mapDock) return;

  const MAPS = [
    { id: "gastronomia", file: "asistente/data/gastronomia.geojson", label: "Gastronomía", dockLabel: "Comer", accent: "#f2a18e" },
    { id: "locales", file: "asistente/data/locales.geojson", label: "Locales y servicios", dockLabel: "Locales", accent: "#9ac6ff" },
    { id: "puntos_interes", file: "asistente/data/puntos_interes.geojson", label: "Puntos de interés", dockLabel: "Interés", accent: "#b7ec87" },
    { id: "balnearios", file: "asistente/data/balnearios.geojson", label: "Balnearios", dockLabel: "Playa", accent: "#84ded6" }
  ];
  const mapOptions = Array.from(mapPicker.querySelectorAll(".map-option"));
  const dockButtons = Array.from(mapDock.querySelectorAll(".map-dock-button"));
  const optionById = new Map();
  const dockById = new Map();
  const dataCache = new Map();
  let mapInstance = null;
  let activeGeoLayer = null;
  let selectedId = null;
  let requestVersion = 0;
  let closeTimer = null;
  let resizeTimer = null;

  mapOptions.forEach((button) => optionById.set(button.dataset.mapId, button));
  dockButtons.forEach((button) => dockById.set(button.dataset.mapId, button));

  function getConfig(id) {
    return MAPS.find((item) => item.id === id) || null;
  }

  function ensureMapNotice() {
    if (mapNotice || !mapSection) return mapNotice;
    mapNotice = document.createElement("div");
    mapNotice.className = "map-switch-notice";
    mapNotice.setAttribute("role", "status");
    mapNotice.setAttribute("aria-live", "polite");
    mapNotice.setAttribute("aria-atomic", "true");
    mapNotice.hidden = true;
    mapSection.appendChild(mapNotice);
    return mapNotice;
  }

  function showMapNotice(label) {
    const notice = ensureMapNotice();
    if (!notice) return;
    window.clearTimeout(mapNoticeTimer);
    notice.textContent = label;
    notice.hidden = false;
    notice.classList.remove("is-visible");
    void notice.offsetWidth;
    notice.classList.add("is-visible");
    mapNoticeTimer = window.setTimeout(() => {
      notice.classList.remove("is-visible");
      window.setTimeout(() => { if (notice && !notice.classList.contains("is-visible")) notice.hidden = true; }, reduceMotion ? 20 : 260);
    }, 1350);
  }

  function setStatus(message, mode) {
    if (!mapStatus || !mapStatusText) return;
    mapStatusText.textContent = message;
    mapStatus.classList.toggle("is-loading", mode === "loading");
    mapStatus.classList.toggle("is-error", mode === "error");
    mapRetry.hidden = mode !== "error";
    mapStatus.hidden = false;
  }

  function clearStatus() {
    if (!mapStatus) return;
    mapStatus.hidden = true;
    mapStatus.classList.remove("is-loading", "is-error");
    mapStatusText.textContent = "";
    mapRetry.hidden = true;
  }

  function ensureLeafletMap() {
    if (mapInstance) return true;
    if (!window.L || typeof window.L.map !== "function") {
      setStatus("El mapa no pudo iniciarse. Recargá la página e intentá de nuevo.", "error");
      return false;
    }

    mapInstance = window.L.map(mapCanvas, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
      zoomSnap: 0.5,
      preferCanvas: true,
      tap: true
    }).setView([-37.265, -56.97], 13);

    // Keep required OpenStreetMap attribution visible above the bottom dock.
    if (mapInstance.attributionControl) {
      mapInstance.attributionControl.setPosition("topright");
      mapInstance.attributionControl.setPrefix(false);
    }

    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(mapInstance);

    window.L.control.zoom({ position: "topright" }).addTo(mapInstance);
    mapInstance.on("popupopen", () => {
      window.setTimeout(() => mapInstance.invalidateSize({ pan: false }), 30);
    });
    return true;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function safeExternalUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const raw = value.trim();
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function safeDescriptionImageUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const raw = value.trim();
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
      // Keep the original Cloudinary path, transformation options, and query string intact.
      return raw;
    } catch (_) {
      return null;
    }
  }

  function renderDescription(value, title) {
    const lines = String(value == null ? "" : value).split(/\r?\n/);
    const blocks = [];
    let textLines = [];
    let images = [];

    function flushText() {
      const text = textLines.join("\n").trim();
      if (text) {
        blocks.push('<p class="map-popup-description-text">' + escapeHtml(text) + '</p>');
      }
      textLines = [];
    }

    function flushImages() {
      if (!images.length) return;
      const imageHtml = images.map((image, index) =>
        '<img class="map-popup-image" src="' + escapeHtml(image.url) +
        '" width="' + image.width + '" alt="' + escapeHtml("Foto " + (index + 1) + " de " + title) +
        '" loading="lazy" decoding="async">'
      ).join("");
      blocks.push('<div class="map-popup-images">' + imageHtml + '</div>');
      images = [];
    }

    // uMap's description syntax stores images as {{https://...|width}}.
    // Parse only that exact pattern; all surrounding text remains escaped.
    const imageDirective = /^\s*\{\{\s*(https:\/\/[^|{}\s]+)\s*\|\s*(\d{1,4})\s*\}\}\s*$/i;
    lines.forEach((line) => {
      const match = line.match(imageDirective);
      if (match) {
        const url = safeDescriptionImageUrl(match[1]);
        const width = Number(match[2]);
        if (url && Number.isInteger(width) && width > 0 && width <= 1200) {
          flushText();
          images.push({url, width});
          return;
        }
      }
      flushImages();
      textLines.push(line);
    });
    flushText();
    flushImages();

    return '<div class="map-popup-description">' + blocks.join("") + '</div>';
  }

  function popupHtml(feature, config) {
    const p = feature && feature.properties ? feature.properties : {};
    const title = p.name || p.title || config.label;
    const category = p.category || "";
    const description = p.description || p.short_description || p.place_description || "";
    const parts = [
      '<article class="map-popup">',
      '<p class="map-popup-kicker">' + escapeHtml(config.label) + '</p>',
      '<h3>' + escapeHtml(title) + '</h3>'
    ];

    if (category && category !== title) {
      parts.push('<p class="map-popup-category">' + escapeHtml(category) + '</p>');
    }
    if (description) {
      parts.push(renderDescription(description, title));
    }

    const details = [];
    if (p.address) details.push(["Dirección", p.address]);
    if (p.opening_hours) details.push(["Horarios", p.opening_hours]);
    if (p.price_range) details.push(["Precios", p.price_range]);
    if (details.length) {
      parts.push('<dl class="map-popup-details">');
      details.forEach(([label, value]) => {
        parts.push('<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>');
      });
      parts.push('</dl>');
    }

    const links = [];
    const website = safeExternalUrl(p.website);
    const instagram = safeExternalUrl(p.instagram);
    if (website) links.push('<a href="' + escapeHtml(website) + '" target="_blank" rel="noopener noreferrer">Sitio web</a>');
    if (instagram) links.push('<a href="' + escapeHtml(instagram) + '" target="_blank" rel="noopener noreferrer">Instagram</a>');
    if (links.length) parts.push('<div class="map-popup-links">' + links.join("") + '</div>');
    parts.push('</article>');
    return parts.join("");
  }

  async function fetchCollection(config) {
    if (dataCache.has(config.id)) return dataCache.get(config.id);
    const response = await fetch(config.file, { credentials: "same-origin" });
    if (!response.ok) throw new Error("GeoJSON HTTP " + response.status);
    const source = await response.json();
    if (!source || source.type !== "FeatureCollection" || !Array.isArray(source.features)) {
      throw new Error("Formato GeoJSON inválido");
    }

    const features = source.features.filter((feature) => {
      if (!feature || feature.type !== "Feature" || !feature.geometry ||
          feature.geometry.type !== "Point" || !Array.isArray(feature.geometry.coordinates) ||
          feature.geometry.coordinates.length < 2) return false;
      const longitude = Number(feature.geometry.coordinates[0]);
      const latitude = Number(feature.geometry.coordinates[1]);
      return Number.isFinite(longitude) && Number.isFinite(latitude) &&
        longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
    });

    if (!features.length) throw new Error("El GeoJSON no tiene puntos válidos");
    const collection = { type: "FeatureCollection", features: features };
    dataCache.set(config.id, collection);
    return collection;
  }

  function markerFor(feature, latlng, config) {
    const properties = feature && feature.properties ? feature.properties : {};
    const options = properties._umap_options && typeof properties._umap_options === "object"
      ? properties._umap_options : {};
    const rawIconUrl = typeof options.iconUrl === "string" ? options.iconUrl.trim() : "";
    const sizeValue = Number(options.iconSize);
    const size = Number.isFinite(sizeValue) ? Math.max(24, Math.min(48, sizeValue)) : 36;
    const label = properties.name || properties.title || config.label;
    const color = typeof options.color === "string" && /^#[0-9a-f]{3,8}$/i.test(options.color)
      ? options.color : config.accent;

    // uMap iconUrl is a real image override, not decoration inside a generic
    // marker. Render the assigned asset directly with Leaflet's image icon so
    // its original artwork, transparency, and proportions are preserved.
    if (rawIconUrl) {
      try {
        const candidate = new URL(rawIconUrl, window.location.href);
        if ((candidate.protocol === "https:" || candidate.protocol === "http:") &&
            candidate.hostname === "res.cloudinary.com") {
          return window.L.marker(latlng, {
            icon: window.L.icon({
              iconUrl: candidate.href,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
              popupAnchor: [0, -size / 2],
              className: "geo-custom-marker"
            }),
            title: String(label),
            alt: String(label),
            keyboard: true
          });
        }
      } catch (_) {
        // A malformed custom URL falls back to the map's normal round marker.
      }
    }

    // Standard LargeCircle entries stay round and use the original per-feature
    // color when present. They no longer inherit the selector's SVG symbols.
    const html = '<span class="geo-round-marker" style="--marker-color:' +
      escapeHtml(color) + '" aria-hidden="true"></span>';
    return window.L.marker(latlng, {
      icon: window.L.divIcon({
        className: "geo-marker-host",
        html: html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
        bgPos: null
      }),
      title: String(label),
      alt: String(label),
      keyboard: true
    });
  }

  function setActiveButtons(id) {
    mapOptions.forEach((button) => {
      const active = button.dataset.mapId === id;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
    dockButtons.forEach((button) => {
      const active = button.dataset.mapId === id;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    });
    const activeIndex = MAPS.findIndex((item) => item.id === id);
    mapDock.style.setProperty("--active-index", String(Math.max(0, activeIndex)));
    mapDock.style.setProperty("--active-accent", (getConfig(id) || MAPS[0]).accent);
  }

  async function selectMap(id, options) {
    const config = getConfig(id);
    if (!config) return;
    const opts = options || {};
    const previousId = selectedId;
    if (selectedId === id && activeGeoLayer && !opts.force) {
      if (mapInstance) mapInstance.invalidateSize({ pan: false });
      return;
    }

    selectedId = id;
    if (opts.showNotice && previousId && previousId !== id) showMapNotice(config.label);
    const version = ++requestVersion;
    setActiveButtons(id);
    mapSection.classList.add("has-selection");
    mapPicker.setAttribute("aria-hidden", "true");
    mapPicker.setAttribute("inert", "");
    mapDock.removeAttribute("inert");
    mapDock.setAttribute("aria-hidden", "false");
    mapCanvas.setAttribute("aria-hidden", "false");

    if (activeGeoLayer) {
      activeGeoLayer.remove();
      activeGeoLayer = null;
    }

    clearStatus();
    setStatus("Cargando " + config.label.toLowerCase() + "…", "loading");
    if (!ensureLeafletMap()) return;

    try {
      const collection = await fetchCollection(config);
      if (version !== requestVersion) return;

      const nextLayer = window.L.geoJSON(collection, {
        pointToLayer: (feature, latlng) => markerFor(feature, latlng, config),
        onEachFeature: (feature, layer) => {
          layer.bindPopup(popupHtml(feature, config), {
            maxWidth: Math.min(340, Math.max(230, window.innerWidth - 40)),
            minWidth: Math.min(230, Math.max(190, window.innerWidth - 56)),
            maxHeight: Math.max(180, Math.min(360, window.innerHeight - 150)),
            autoPanPadding: [24, 24],
            closeButton: true
          });
        }
      });
      if (!nextLayer.getLayers().length) throw new Error("No hay puntos para mostrar");
      nextLayer.addTo(mapInstance);
      activeGeoLayer = nextLayer;

      const layers = nextLayer.getLayers();
      if (layers.length === 1 && typeof layers[0].getLatLng === "function") {
        mapInstance.setView(layers[0].getLatLng(), 15.5, { animate: !reduceMotion, duration: 0.42 });
      } else {
        const bounds = nextLayer.getBounds();
        if (bounds.isValid()) {
          mapInstance.fitBounds(bounds, {
            paddingTopLeft: [30, 76],
            paddingBottomRight: [30, 112],
            maxZoom: 16.5,
            animate: !reduceMotion
          });
        }
      }
      clearStatus();
      window.requestAnimationFrame(() => {
        if (mapInstance) mapInstance.invalidateSize({ pan: false });
      });
      if (opts.focus !== false) {
        window.setTimeout(() => {
          if (selectedId !== id || !mapSection.classList.contains("is-open")) return;
          const activeButton = dockById.get(id);
          if (activeButton) activeButton.focus({ preventScroll: true });
        }, reduceMotion ? 30 : 360);
      }
    } catch (error) {
      if (version !== requestVersion) return;
      console.error("No se pudo cargar el mapa de " + config.label + ".", error);
      setStatus("No pudimos cargar este mapa. Revisá la conexión e intentá de nuevo.", "error");
    }
  }

  function finishClose() {
    if (!mapSection.classList.contains("is-closing") || mapSection.classList.contains("is-open")) return;
    window.clearTimeout(closeTimer);
    mapSection.classList.remove("is-closing");
    mapSection.inert = true;
    mapSection.setAttribute("aria-hidden", "true");
    if (hero) {
      hero.inert = false;
      hero.setAttribute("aria-hidden", "false");
    }
    mapToggle.focus({ preventScroll: true });
  }

  function openMap() {
    window.clearTimeout(closeTimer);
    mapSection.classList.remove("is-closing");
    if (mapSection.classList.contains("is-open")) return;
    mapSection.inert = false;
    mapSection.setAttribute("aria-hidden", "false");
    if (hero) {
      hero.inert = true;
      hero.setAttribute("aria-hidden", "true");
    }
    mapSection.classList.add("is-open");
    mapToggle.setAttribute("aria-expanded", "true");
    if (mapInstance) window.requestAnimationFrame(() => mapInstance.invalidateSize({ pan: false }));
    window.setTimeout(() => {
      if (!mapSection.classList.contains("is-open")) return;
      const target = selectedId ? dockById.get(selectedId) : mapPicker.querySelector(".map-option");
      if (target) target.focus({ preventScroll: true });
    }, reduceMotion ? 20 : 190);
  }

  function closeMap() {
    if (!mapSection.classList.contains("is-open")) return;
    mapSection.classList.remove("is-open");
    mapSection.classList.add("is-closing");
    mapToggle.setAttribute("aria-expanded", "false");
    closeTimer = window.setTimeout(finishClose, reduceMotion ? 30 : 640);
  }

  mapToggle.addEventListener("click", openMap);
  if (panoramaToggle) panoramaToggle.addEventListener("click", closeMap);
  mapOptions.forEach((button) => button.addEventListener("click", () => selectMap(button.dataset.mapId)));
  dockButtons.forEach((button) => button.addEventListener("click", () => selectMap(button.dataset.mapId, { showNotice: true })));
  mapRetry.addEventListener("click", () => {
    if (selectedId) {
      dataCache.delete(selectedId);
      selectMap(selectedId, { force: true, focus: false });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mapSection.classList.contains("is-open")) {
      event.preventDefault();
      closeMap();
    }
  });

  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (mapInstance && mapSection.classList.contains("is-open")) mapInstance.invalidateSize({ pan: false });
    }, 100);
  });

  // Briefly scale popup descriptions in response to pinch attempts, then spring back.
  let popupPinchStartDistance = 0;
  let popupPinchDescription = null;
  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
  mapCanvas.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2 || !event.target.closest(".leaflet-popup-content")) return;
    popupPinchDescription = event.target.closest(".leaflet-popup-content")?.querySelector(".map-popup-description");
    if (!popupPinchDescription) return;
    popupPinchStartDistance = touchDistance(event.touches);
    popupPinchDescription.classList.remove("is-pinch-returning");
    event.stopImmediatePropagation();
  }, { capture: true, passive: true });
  mapCanvas.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !popupPinchDescription || !popupPinchStartDistance) return;
    const ratio = touchDistance(event.touches) / popupPinchStartDistance;
    const scale = Math.max(.86, Math.min(1.14, ratio));
    popupPinchDescription.style.transform = "scale(" + scale.toFixed(3) + ")";
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, passive: false });
  function resetPopupPinch(event) {
    if (!popupPinchDescription) return;
    if (event && event.touches && event.touches.length > 0) return;
    if (event) event.stopImmediatePropagation();
    const description = popupPinchDescription;
    popupPinchDescription = null;
    popupPinchStartDistance = 0;
    description.classList.add("is-pinch-returning");
    description.style.transform = "scale(1)";
    window.setTimeout(() => description.classList.remove("is-pinch-returning"), reduceMotion ? 30 : 420);
  }
  mapCanvas.addEventListener("touchend", resetPopupPinch, { capture: true, passive: true });
  mapCanvas.addEventListener("touchcancel", resetPopupPinch, { capture: true, passive: true });

  mapSection.addEventListener("transitionend", (event) => {
    if (event.target === mapSection && event.propertyName === "opacity") finishClose();
  });
})();