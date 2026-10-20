/* Normalize Pannellum's legacy window.orientation value to the modern Screen Orientation API.
   Pannellum uses window.orientation to rotate sensor coordinates; on some browsers this
   legacy value can be stale or unavailable after switching to landscape. */
(function () {
  if (!window.screen || !window.screen.orientation ||
      !Number.isFinite(window.screen.orientation.angle)) return;

  try {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'orientation');
    if (descriptor && descriptor.configurable === false) return;

    Object.defineProperty(window, 'orientation', {
      configurable: true,
      enumerable: true,
      get: function () {
        return window.screen.orientation.angle;
      }
    });
  } catch (error) {
    // Keep the native property if the browser does not allow compatibility override.
    console.warn('No se pudo normalizar el ángulo de orientación de pantalla.', error);
  }
})();
