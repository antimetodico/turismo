const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const suggestions = document.querySelector("#suggestions");
const sendButton = document.querySelector("#sendButton");
const messagesEl = document.querySelector("#messages");
const statusEl = document.querySelector("#status");
const locationButton = document.querySelector("#locationButton");
const clearButton = document.querySelector("#clearButton");
const backHomeLink = document.querySelector("#backHomeLink");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Keep the chat layout inside the actually visible area when a mobile keyboard opens.
// visualViewport.height accounts for keyboards that overlay the layout viewport.
function syncVisualViewport() {
  const viewport = window.visualViewport;
  if (!viewport) {
    document.documentElement.style.removeProperty("--chat-viewport-height");
    document.documentElement.style.removeProperty("--chat-viewport-top");
    return;
  }
  document.documentElement.style.setProperty("--chat-viewport-height", viewport.height + "px");
  document.documentElement.style.setProperty("--chat-viewport-top", viewport.offsetTop + "px");
}
syncVisualViewport();
window.visualViewport?.addEventListener("resize", syncVisualViewport);
window.visualViewport?.addEventListener("scroll", syncVisualViewport);
window.addEventListener("orientationchange", () => window.setTimeout(syncVisualViewport, 150));

let visitorLocation = null;
let chatHistory = [];
let busy = false;

if (document.documentElement.classList.contains("intro-active")) {
  window.history.replaceState(null, "", window.location.pathname);
  const brandMark = document.querySelector("#brandMark");
  window.setTimeout(() => {
    brandMark?.classList.add("is-docked");
    window.setTimeout(() => document.documentElement.classList.add("page-ready"), 90);
  }, 70);
}

backHomeLink?.addEventListener("click", event => {
  if (reduceMotion || (event.button !== 0 && event.button !== undefined) || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (backHomeLink.dataset.exiting === "true") {
    event.preventDefault();
    return;
  }
  event.preventDefault();
  backHomeLink.dataset.exiting = "true";
  document.documentElement.classList.add("is-exiting");

  const transition = document.createElement("div");
  transition.className = "exit-transition";
  transition.setAttribute("aria-hidden", "true");
  document.body.append(transition);
  window.requestAnimationFrame(() => transition.classList.add("is-active"));

  const destination = new URL("/", window.location.origin);
  destination.searchParams.set("fromGesellGO", "1");
  window.setTimeout(() => window.location.assign(destination.toString()), 430);
});

locationButton.addEventListener("click", () => {
  statusEl.textContent = "";
  if (visitorLocation) {
    visitorLocation = null;
    locationButton.setAttribute("aria-pressed", "false");
    locationButton.setAttribute("aria-label", "Activar ubicación");
    locationButton.title = "Activar ubicación";
    statusEl.textContent = "Ubicación desactivada.";
    return;
  }
  if (!navigator.geolocation) {
    statusEl.textContent = "Este navegador no ofrece geolocalización.";
    return;
  }
  locationButton.disabled = true;
  locationButton.setAttribute("aria-label", "Buscando ubicación");
  navigator.geolocation.getCurrentPosition(
    position => {
      visitorLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      locationButton.disabled = false;
      locationButton.setAttribute("aria-pressed", "true");
      locationButton.setAttribute("aria-label", "Desactivar ubicación");
      locationButton.title = "Desactivar ubicación";
      statusEl.textContent = "Ubicación disponible. Se enviará junto con tu próxima consulta.";
    },
    error => {
      visitorLocation = null;
      locationButton.disabled = false;
      locationButton.setAttribute("aria-pressed", "false");
      locationButton.setAttribute("aria-label", "Activar ubicación");
      locationButton.title = "Activar ubicación";
      const messages = {
        1: "No se concedió permiso de ubicación. Podés seguir usando el chat sin compartirla.",
        2: "No se pudo determinar la ubicación. Probá de nuevo o seguí sin ella.",
        3: "La solicitud de ubicación tardó demasiado. Probá de nuevo."
      };
      statusEl.textContent = messages[error.code] || "No se pudo obtener la ubicación.";
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
  );
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  const message = input.value.trim();
  if (!message) return;

  appendMessage("user", message);
  chatHistory.push({ role: "user", text: message });
  input.value = "";
  updateComposer();
  statusEl.textContent = "";
  setBusy(true);
  const typing = appendTyping();

  try {
    const response = await fetch("/asistente/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: chatHistory.slice(0, -1).slice(-8),
        locationEnabled: Boolean(visitorLocation),
        latitude: visitorLocation?.latitude,
        longitude: visitorLocation?.longitude
      })
    });
    const data = await response.json().catch(() => ({}));
    typing.remove();
    if (!response.ok) {
      console.error("GesellGO API error:", response.status, data.diagnostic || data.error);
      throw new Error(data.error || "Error del servidor (" + response.status + ").");
    }
    appendMessage("assistant", data.reply || "No llegó una respuesta de texto.");
    chatHistory.push({ role: "model", text: data.reply || "" });
    chatHistory = chatHistory.slice(-8);
  } catch (error) {
    typing.remove();
    appendMessage("assistant", "Se me complicó responder en este momento. Probá de nuevo en un ratito.");
    console.error("GesellGO chat request failed:", error);
    chatHistory.pop();
  } finally {
    setBusy(false);
  }
});

input.addEventListener("input", updateComposer);
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt || "";
    updateComposer();
    input.focus();
  });
});

clearButton.addEventListener("click", () => {
  if (busy) return;
  chatHistory = [];
  messagesEl.replaceChildren();
  appendMessage("assistant", "Listo, arrancamos de nuevo. ¿Qué andás buscando?");
  statusEl.textContent = "";
  input.focus();
});

function updateComposer() {
  resizeInput();
  suggestions.classList.toggle("is-hidden", input.value.trim().length > 0);
}

function appendMessage(role, text) {
  const article = document.createElement("article");
  article.className = "message " + (role === "user" ? "user-message" : "assistant-message");
  const content = document.createElement("div");
  content.className = "message-content";
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  content.append(paragraph);
  article.append(content);
  messagesEl.append(article);
  scrollMessagesToBottom();
  return article;
}

function appendTyping() {
  const article = document.createElement("article");
  article.className = "message assistant-message";
  article.setAttribute("aria-label", "GesellGO está preparando una respuesta");
  const typing = document.createElement("div");
  typing.className = "typing";
  for (let i = 0; i < 3; i++) typing.append(document.createElement("span"));
  article.append(typing);
  messagesEl.append(article);
  scrollMessagesToBottom();
  return article;
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  input.disabled = value;
  sendButton.setAttribute("aria-label", value ? "Enviando mensaje" : "Enviar mensaje");
}

function resizeInput() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 112) + "px";
}

function scrollMessagesToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* Browsers may restore this page from the back-forward cache with the exit
   transition still covering the screen. Clear it so Back never lands on black. */
window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  document.querySelector(".exit-transition")?.remove();
  document.documentElement.classList.remove("is-exiting");
  if (backHomeLink) delete backHomeLink.dataset.exiting;
});

/* Cycling example prompts: the composer placeholder types and erases sample
   questions. It pauses while the visitor is typing or the tab is hidden, and stays
   on a single static example for visitors who prefer reduced motion. */
const PLACEHOLDER_EXAMPLES = [
  "¿dónde puedo picar algo?",
  "¿qué hago si llueve?",
  "busco una farmacia",
  "¿dónde tomo un buen café?",
  "where can I eat empanadas?",
  "playas tranquilas para ir",
  "melhor lugar pra jantar?",
  "¿qué hay cerca de mí?",
  "pizza cerca de acá",
  "¿hay buena parrilla?"
];
const TYPE_MS = 58, ERASE_MS = 26, HOLD_MS = 2000, GAP_MS = 450;
let placeholderIndex = 0, placeholderChars = 0, placeholderErasing = false, placeholderTimer = null;

// Skip examples that would wrap onto a second line in the one-line field (narrow phones).
const measureCanvas = document.createElement("canvas").getContext("2d");
function placeholderFits(phrase) {
  const style = window.getComputedStyle(input);
  measureCanvas.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
  const available = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return available <= 0 || measureCanvas.measureText(phrase).width <= available - 4;
}

function placeholderStep() {
  window.clearTimeout(placeholderTimer);
  if (document.hidden || input.disabled || input.value) {
    // Nothing visible to animate right now; check again shortly.
    placeholderTimer = window.setTimeout(placeholderStep, 500);
    return;
  }
  let phrase = PLACEHOLDER_EXAMPLES[placeholderIndex];
  if (!placeholderErasing && placeholderChars === 0) {
    for (let tries = 0; tries < PLACEHOLDER_EXAMPLES.length && !placeholderFits(phrase); tries++) {
      placeholderIndex = (placeholderIndex + 1) % PLACEHOLDER_EXAMPLES.length;
      phrase = PLACEHOLDER_EXAMPLES[placeholderIndex];
    }
  }
  let delay;
  if (!placeholderErasing) {
    placeholderChars = Math.min(placeholderChars + 1, phrase.length);
    delay = placeholderChars === phrase.length ? HOLD_MS : TYPE_MS + Math.random() * 40;
    if (placeholderChars === phrase.length) placeholderErasing = true;
  } else {
    placeholderChars = Math.max(placeholderChars - 1, 0);
    if (placeholderChars === 0) {
      placeholderErasing = false;
      placeholderIndex = (placeholderIndex + 1) % PLACEHOLDER_EXAMPLES.length;
      delay = GAP_MS;
    } else {
      delay = ERASE_MS;
    }
  }
  input.placeholder = phrase.slice(0, placeholderChars);
  placeholderTimer = window.setTimeout(placeholderStep, delay);
}

if (!reduceMotion) {
  input.placeholder = "";
  placeholderStep();
  // When the field is emptied again (sent message or cleared text), start a fresh phrase.
  input.addEventListener("input", () => {
    if (!input.value) { placeholderChars = 0; placeholderErasing = false; }
  });
}


// ── Official tourism events carousel ─────────────────────────────────────────
const eventsSection = document.querySelector("#eventsSection");
const eventsRail = document.querySelector("#eventsRail");
const eventsPrev = document.querySelector("#eventsPrev");
const eventsNext = document.querySelector("#eventsNext");
const eventDialog = document.querySelector("#eventDialog");
const eventDialogClose = document.querySelector("#eventDialogClose");
const eventDialogImage = document.querySelector("#eventDialogImage");
const eventDialogTitle = document.querySelector("#eventDialogTitle");
const eventDialogDescription = document.querySelector("#eventDialogDescription");
const eventDialogDate = document.querySelector("#eventDialogDate");
const eventDialogLocation = document.querySelector("#eventDialogLocation");
const eventDialogSource = document.querySelector("#eventDialogSource");
let eventCards = [];

loadEvents();

async function loadEvents() {
  if (!eventsSection || !eventsRail) return;
  try {
    const response = await fetch("/asistente/api/events", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Events endpoint returned " + response.status);
    const data = await response.json();
    eventCards = Array.isArray(data.events) ? data.events : [];
    if (!eventCards.length) return;
    eventsRail.replaceChildren(...eventCards.map(createEventCard));
    eventsSection.hidden = false;
    eventsPrev.addEventListener("click", () => scrollEvents(-1));
    eventsNext.addEventListener("click", () => scrollEvents(1));
  } catch (error) {
    // The chat remains fully usable if the tourism agenda is temporarily unavailable.
    console.warn("GesellGO events are temporarily unavailable:", error);
  }
}

function createEventCard(event) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "event-card";
  button.setAttribute("aria-label", "Ver evento: " + event.title);
  const imageWrap = document.createElement("span");
  imageWrap.className = "event-card-image-wrap";
  const image = document.createElement("img");
  image.src = event.image;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => imageWrap.classList.add("image-unavailable"), { once: true });
  imageWrap.append(image);
  const body = document.createElement("span");
  body.className = "event-card-body";
  const title = document.createElement("span");
  title.className = "event-card-title";
  title.textContent = event.title;
  const date = document.createElement("span");
  date.className = "event-card-date";
  date.textContent = event.dateLabel || event.dateText || "Próximamente";
  body.append(title, date);
  button.append(imageWrap, body);
  button.addEventListener("click", () => openEvent(event));
  return button;
}

function scrollEvents(direction) {
  if (!eventsRail) return;
  const card = eventsRail.querySelector(".event-card");
  eventsRail.scrollBy({ left: direction * ((card?.getBoundingClientRect().width || 210) + 12), behavior: reduceMotion ? "auto" : "smooth" });
}

async function openEvent(event) {
  if (!eventDialog) return;
  eventDialogTitle.textContent = event.title || "Evento";
  eventDialogDescription.textContent = "Cargando información del evento…";
  eventDialogDate.textContent = event.dateLabel || event.dateText || "Fecha a confirmar";
  eventDialogLocation.textContent = event.location || "Villa Gesell";
  eventDialogSource.href = event.url || "https://www.gesell.tur.ar/eventos";
  eventDialogImage.src = event.image || "";
  eventDialogImage.alt = event.title || "";
  if (!eventDialog.open) eventDialog.showModal();
  try {
    const detailUrl = new URL("/asistente/api/event-detail", window.location.origin);
    detailUrl.searchParams.set("url", event.url);
    const response = await fetch(detailUrl.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Event detail endpoint returned " + response.status);
    const detail = await response.json();
    if (!eventDialog.open || eventDialogSource.href !== (event.url || "https://www.gesell.tur.ar/eventos")) return;
    eventDialogTitle.textContent = detail.title || event.title;
    eventDialogDescription.textContent = detail.description || "Consultá la agenda oficial para ver más información sobre esta actividad.";
    eventDialogDate.textContent = detail.dateLabel || event.dateLabel || event.dateText || "Fecha a confirmar";
    eventDialogLocation.textContent = detail.location || event.location || "Villa Gesell";
    if (detail.image) eventDialogImage.src = detail.image;
  } catch (error) {
    eventDialogDescription.textContent = "No pudimos cargar la descripción ahora. Podés consultar los detalles en la agenda oficial.";
    console.warn("GesellGO event detail unavailable:", error);
  }
}

eventDialogClose?.addEventListener("click", () => eventDialog.close());
eventDialog?.addEventListener("click", event => {
  if (event.target === eventDialog) eventDialog.close();
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && eventDialog?.open) eventDialog.close();
});
