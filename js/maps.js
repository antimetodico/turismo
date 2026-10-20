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
      parts.push('<p class="map-popup-description">' + escapeHtml(description) + '</p>');
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
    const assignedColor = typeof options.color === "string" && /^#[0-9a-f]{3,8}$/i.test(options.color)
      ? options.color : config.accent;
    const rawIconUrl = typeof options.iconUrl === "string" ? options.iconUrl.trim() : "";
    let iconUrl = null;

    if (rawIconUrl) {
      try {
        const candidate = new URL(rawIconUrl, window.location.href);
        if (candidate.protocol === "https:" && candidate.hostname === "res.cloudinary.com") {
          iconUrl = candidate.href;
        }
      } catch (_) {}
    }

    // Keep the round LargeCircle marker style from the GeoJSON. Brand-specific
    // iconUrl assignments remain circular images; ordinary points stay round dots.
    const inside = iconUrl
      ? '<img class="geo-pin-image" src="' + escapeHtml(iconUrl) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="geo-pin-dot" aria-hidden="true"></span>';
    const html = '<span class="geo-pin" style="--pin-accent:' + assignedColor + '" aria-hidden="true">' + inside + '</span>';
    const label = properties.name || properties.title || config.label;
    const size = Number.isFinite(Number(options.iconSize)) ? Math.max(26, Math.min(40, Number(options.iconSize))) : 36;

    return window.L.marker(latlng, {
      icon: window.L.divIcon({
        className: "geo-marker-host",
        html: html,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 + 1]
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
    if (selectedId === id && activeGeoLayer && !opts.force) {
      if (mapInstance) mapInstance.invalidateSize({ pan: false });
      return;
    }

    selectedId = id;
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
  dockButtons.forEach((button) => button.addEventListener("click", () => selectMap(button.dataset.mapId)));
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

  mapSection.addEventListener("transitionend", (event) => {
    if (event.target === mapSection && event.propertyName === "opacity") finishClose();
  });
})();