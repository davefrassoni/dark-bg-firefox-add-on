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

  // A fade is useful only when the visible surface changes from dark (or an
  // unknown, conservatively treated as dark surface) to a bright page.
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
