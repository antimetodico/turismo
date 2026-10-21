/* GESELL landing page behavior: panorama title, motion control, and animated map overlay. */
const SUBTITLES = ['es querer volver', 'es otra cosa', 'es para vos'];
const ROTATION_MS = 2500;
const SUBTITLE_FADE_MS = 220;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let currentSubtitleIndex = 0;
let subtitleTimer = null;
let panoramaViewer = null;
let orientationActionId = 0;
let panoramaReady = false;
let brandHotspotAdded = false;
const panoramaElement = document.getElementById('panorama');
const orientationToggle = document.getElementById('orientationToggle');
const mapToggle = document.getElementById('mapToggle');
const panoramaToggle = document.getElementById('panoramaToggle');
const mapSection = document.getElementById('map');
const mapFrame = mapSection?.querySelector('iframe');

function createPanoramaViewer() {
  if (!window.pannellum || !panoramaElement) {
    panoramaReady = true;
    panoramaElement?.classList.add('panorama-unavailable');
    // The brand normally rides inside a Pannellum hotspot; without it, centre it on the static photo.
    document.getElementById('heroBrand')?.classList.add('is-static');
    return null;
  }

  panoramaElement.classList.remove('panorama-unavailable');
  document.getElementById('heroBrand')?.classList.remove('is-static');
  panoramaReady = false;
  const viewer = window.pannellum.viewer('panorama', {
    type: 'equirectangular',
    panorama: 'images/gesell-360.jpg',
    autoLoad: true,
    showControls: false,
    showZoomCtrl: false,
    mouseZoom: true,
    doubleClickZoom: false,
    compass: false,
    pitch: 0,
    yaw: 0,
    hfov: 100,
    minHfov: 45,
    maxHfov: 120,
    draggable: true,
    friction: 0.15,
    orientationOnByDefault: false,
  });

  if (typeof viewer.on === 'function') {
    try { panoramaReady = Boolean(viewer.isLoaded?.()); } catch {}
    viewer.on('load', () => {
      panoramaReady = true;
      if (viewer === panoramaViewer) attachBrandToPanorama();
    });
  } else {
    panoramaReady = true;
  }
  return viewer;
}

panoramaViewer = createPanoramaViewer();
if (panoramaReady) attachBrandToPanorama();
function setOrientationButton(active, message) {
  if (!orientationToggle) return;
  orientationToggle.disabled = false;
  orientationToggle.setAttribute('aria-pressed', String(active));
  orientationToggle.textContent = message || (active ? 'Desactivar movimiento' : 'Activar movimiento');
}

function hideOrientationButton() {
  if (!orientationToggle) return;
  orientationToggle.hidden = true;
  orientationToggle.disabled = true;
}

if (orientationToggle) {
  // Hide the control on browsers/devices that do not expose orientation support.
  if (!panoramaViewer || typeof panoramaViewer.isOrientationSupported !== 'function' ||
      !panoramaViewer.isOrientationSupported()) {
    hideOrientationButton();
  }
  orientationToggle.addEventListener('click', () => {
    const actionId = ++orientationActionId;
    if (!panoramaViewer) {
      setOrientationButton(false, 'Arrastrá para mirar');
      return;
    }

    if (panoramaViewer.isOrientationActive()) {
      panoramaViewer.stopOrientation();
      setOrientationButton(false, 'Activar movimiento');
      return;
    }

    if (!panoramaViewer.isOrientationSupported()) {
      hideOrientationButton();
      return;
    }

    orientationToggle.disabled = true;
    orientationToggle.textContent = 'Solicitando permiso…';
    try {
      panoramaViewer.startOrientation();
    } catch (error) {
      console.warn('No se pudo activar la orientación del dispositivo.', error);
    }

    window.setTimeout(() => {
      if (actionId !== orientationActionId) return;
      const active = panoramaViewer.isOrientationActive();
      setOrientationButton(active);
      if (!active) {
        // Some older phones expose the browser API but have no usable motion sensor.
        hideOrientationButton();
      } else {
        orientationToggle.removeAttribute('title');
      }
    }, 1200);
  });
}

/* Cycle the subtitle only when the visitor has not requested reduced motion. */
function showSubtitle(nextIndex) {
  const subtitle = document.getElementById('subtitle');
  if (!subtitle) return;
  window.clearTimeout(subtitleTimer);

  subtitle.classList.add('is-changing');
  subtitleTimer = window.setTimeout(() => {
    subtitle.textContent = SUBTITLES[nextIndex];
    subtitle.classList.remove('is-changing');
  }, SUBTITLE_FADE_MS);
  currentSubtitleIndex = nextIndex;
}

if (!reduceMotion) {
  window.setInterval(() => {
    if (document.hidden) return;
    showSubtitle((currentSubtitleIndex + 1) % SUBTITLES.length);
  }, ROTATION_MS);
}

/* The selectable GeoJSON map interface is managed by js/maps.js. */

/* Animate the ASISTENTE hand-off before opening GesellGO. */
const assistantLink = document.querySelector(".assistant-toggle");
assistantLink?.addEventListener("click", (event) => {
  if (reduceMotion || (event.button !== 0 && event.button !== undefined) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (assistantLink.dataset.opening === "true") { event.preventDefault(); return; }
  event.preventDefault();
  assistantLink.dataset.opening = "true";
  assistantLink.classList.add("is-activating");
  const transition = document.createElement("div");
  transition.className = "assistant-transition";
  transition.setAttribute("aria-hidden", "true");
  transition.innerHTML = '<div class="transition-mark"><span class="transition-gesell">Gesell</span><span class="transition-go">GO</span></div>';
  document.body.append(transition);
  window.setTimeout(() => transition.classList.add("is-active"), 140);
  const destination = new URL(assistantLink.href, window.location.href);
  destination.searchParams.set("intro", "1");
  window.setTimeout(() => window.location.assign(destination.toString()), 1380);
});

/* Return animation uses the homepage's real DOM title; no duplicate title card. */
const returningFromGesellGO = new URLSearchParams(window.location.search).get("fromGesellGO") === "1";

function startHomepageReturnSequence(force = false) {
  if (!returningFromGesellGO && !force) return;
  if (returningFromGesellGO) {
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
  }
  const root = document.documentElement;
  const startedAt = performance.now();
  root.classList.add("is-returning", "return-title-visible");
  window.setTimeout(() => root.classList.add("return-subtitle-visible"), 400);

  const revealSceneWhenReady = () => {
    const elapsed = performance.now() - startedAt;
    if (!panoramaReady && elapsed < 1450) {
      window.setTimeout(revealSceneWhenReady, 45);
      return;
    }
    root.classList.add("return-scene-visible");
    window.setTimeout(() => root.classList.add("return-controls-visible"), 520);
    window.setTimeout(() => root.classList.remove("is-returning"), 1050);
  };
  window.setTimeout(revealSceneWhenReady, 900);
}

function attachBrandToPanorama() {
  if (!panoramaViewer || brandHotspotAdded) return;
  const brand = document.getElementById('heroBrand');
  if (!brand || typeof panoramaViewer.addHotSpot !== 'function') return;

  brandHotspotAdded = true;
  panoramaViewer.addHotSpot({
    pitch: 0,
    yaw: 0,
    type: 'info',
    cssClass: 'panorama-brand-hotspot',
    createTooltipFunc: (hotSpotDiv) => {
      hotSpotDiv.classList.add('panorama-brand-hotspot');
      hotSpotDiv.appendChild(brand);
    }
  });
}

startHomepageReturnSequence();

/* Browsers may restore the homepage from the back-forward cache with the
   outgoing transition still covering the screen. Clean it up and replay the
   return reveal so the native phone Back gesture works just like the UI button. */
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;

  document.querySelector('.assistant-transition')?.remove();
  if (assistantLink) {
    delete assistantLink.dataset.opening;
    assistantLink.classList.remove('is-activating');
  }

  /* iOS Safari can restore a bfcache page with Pannellum's WebGL canvas
     corrupted (often visible as colored vertical bands). Recreate the viewer
     instead of trying to reuse the invalid GPU drawing buffer. */
  try {
    if (panoramaViewer?.isOrientationActive?.()) panoramaViewer.stopOrientation();
    panoramaViewer?.destroy?.();
  } catch (error) {
    console.warn('No se pudo reiniciar el visor 360° restaurado.', error);
  }
  if (panoramaElement) panoramaElement.replaceChildren();
  brandHotspotAdded = false;
  panoramaViewer = createPanoramaViewer();
  if (panoramaReady) attachBrandToPanorama();

  if (orientationToggle) {
    if (panoramaViewer && typeof panoramaViewer.isOrientationSupported === 'function' &&
        panoramaViewer.isOrientationSupported()) {
      orientationToggle.hidden = false;
      orientationToggle.disabled = false;
      setOrientationButton(false, 'Activar movimiento');
      orientationToggle.removeAttribute('title');
    } else {
      hideOrientationButton();
    }
  }

  startHomepageReturnSequence(true);
});


/* Recalibrate device-orientation tracking after switching between portrait and
   landscape. Pannellum's sensor transform is based on screen orientation; the
   yaw reference can otherwise remain anchored to the previous screen angle. */
let orientationChangeTimer = null;
function handleScreenOrientationChange() {
  if (!panoramaViewer || !orientationToggle ||
      typeof panoramaViewer.isOrientationActive !== 'function' ||
      !panoramaViewer.isOrientationActive()) return;

  window.clearTimeout(orientationChangeTimer);

  // iOS requires sensor activation to happen in a user gesture. Stop cleanly
  // and let the visitor tap the control again rather than making a rejected
  // permission request from this event handler.
  const needsUserGesture = typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function';

  if (needsUserGesture) {
    panoramaViewer.stopOrientation();
    setOrientationButton(false, 'Activar movimiento');
    orientationToggle.title = 'Tocá para reactivar el movimiento después de girar la pantalla.';
    return;
  }

  orientationToggle.disabled = true;
  orientationToggle.textContent = 'Reajustando movimiento…';
  orientationChangeTimer = window.setTimeout(() => {
    if (!panoramaViewer) return;
    if (panoramaViewer.isOrientationActive()) panoramaViewer.stopOrientation();
    window.setTimeout(() => {
      if (!panoramaViewer || !panoramaViewer.isOrientationSupported()) {
        hideOrientationButton();
        return;
      }
      try {
        panoramaViewer.startOrientation();
        setOrientationButton(true, 'Desactivar movimiento');
        orientationToggle.removeAttribute('title');
      } catch (error) {
        console.warn('No se pudo reajustar la orientación del dispositivo.', error);
        setOrientationButton(false, 'Activar movimiento');
      }
    }, 120);
  }, 250);
}

window.addEventListener('orientationchange', handleScreenOrientationChange);
if (window.screen && window.screen.orientation &&
    typeof window.screen.orientation.addEventListener === 'function') {
  window.screen.orientation.addEventListener('change', handleScreenOrientationChange);
}
