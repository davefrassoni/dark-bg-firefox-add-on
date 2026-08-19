(function exposeTransitionPolicy(root, factory) {
  const policy = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = policy;
  } else {
    root.DarkAntiFlashPolicy = policy;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const BRIGHTNESS_BRIGHT = "bright";
  const BRIGHTNESS_DARK = "dark";

  function normalizeBrightness(value) {
    if (value === BRIGHTNESS_BRIGHT || value === BRIGHTNESS_DARK) {
      return value;
    }
    return null;
  }

  // Fade only when going from dark (or unknown, treated as dark) to bright.
  function shouldFadeTransition(previousBrightness, nextBrightness) {
    return (
      normalizeBrightness(nextBrightness) === BRIGHTNESS_BRIGHT &&
      normalizeBrightness(previousBrightness) !== BRIGHTNESS_BRIGHT
    );
  }

  return {
    BRIGHTNESS_BRIGHT,
    BRIGHTNESS_DARK,
    normalizeBrightness,
    shouldFadeTransition
  };
});
