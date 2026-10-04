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

  // A background tab gets a guard pre-painted when switching to it would go
  // from the window's current (dark or unknown) brightness to a bright page.
  function shouldArmGuard(tabActive, tabBrightness, activeBrightness) {
    return !tabActive && shouldFadeTransition(activeBrightness, tabBrightness);
  }

  // Only tabs whose guard state actually changes need a message.
  // tabs: [{ id, active }], lastSent: { [tabId]: boolean | undefined }.
  function planGuardMessages(tabs, tabBrightness, activeBrightness, lastSent) {
    const messages = [];
    for (const tab of tabs) {
      const armed = shouldArmGuard(
        tab.active,
        normalizeBrightness(tabBrightness[tab.id]),
        normalizeBrightness(activeBrightness)
      );
      if (lastSent[tab.id] !== armed) {
        messages.push({ tabId: tab.id, armed });
      }
    }
    return messages;
  }

  return {
    BRIGHTNESS_BRIGHT,
    BRIGHTNESS_DARK,
    normalizeBrightness,
    shouldFadeTransition,
    shouldArmGuard,
    planGuardMessages
  };
});
