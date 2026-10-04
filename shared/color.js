// Color math shared by the content script, the background and the tests.
(function exposeColor(root, factory) {
  const color = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = color;
  } else {
    root.DarkAntiFlashColor = color;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const TRANSPARENT = Object.freeze({ r: 0, g: 0, b: 0, a: 0 });

  function clampChannel(value, max) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.min(max, Math.max(0, num)) : 0;
  }

  // Parses computed-style colors: "rgb(1, 2, 3)", "rgba(1, 2, 3, 0.5)" and
  // the space-separated "rgb(1 2 3 / 0.5)" form.
  function parseRgbString(value) {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim().replace(/\s*\/\s*/, ",");
    const match = normalized.match(
      /^rgba?\(\s*([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*|\s+)([\d.]+)(?:\s*,\s*([\d.]+%?))?\s*\)$/i
    );
    if (!match) {
      return null;
    }
    let alpha = 1;
    if (match[4] !== undefined) {
      alpha = match[4].endsWith("%")
        ? clampChannel(parseFloat(match[4]) / 100, 1)
        : clampChannel(match[4], 1);
    }
    return {
      r: clampChannel(match[1], 255),
      g: clampChannel(match[2], 255),
      b: clampChannel(match[3], 255),
      a: alpha
    };
  }

  function brightnessOf(color) {
    return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
  }

  function compositeColors(foreground, background) {
    const alpha = foreground.a + background.a * (1 - foreground.a);
    if (alpha <= 0) {
      return { ...TRANSPARENT };
    }
    const mix = (channel) =>
      (foreground[channel] * foreground.a +
        background[channel] * background.a * (1 - foreground.a)) /
      alpha;
    return { r: mix("r"), g: mix("g"), b: mix("b"), a: alpha };
  }

  function averageColors(colors) {
    if (colors.length === 0) {
      return null;
    }
    const sum = colors.reduce(
      (total, color) => ({
        r: total.r + color.r,
        g: total.g + color.g,
        b: total.b + color.b,
        a: total.a + color.a
      }),
      { ...TRANSPARENT }
    );
    const n = colors.length;
    return { r: sum.r / n, g: sum.g / n, b: sum.b / n, a: sum.a / n };
  }

  function rgbToHex(color) {
    const part = (value) =>
      Math.round(clampChannel(value, 255)).toString(16).padStart(2, "0");
    return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
  }

  function hexToRgb(hex) {
    const match = typeof hex === "string" && hex.match(/^#([0-9a-f]{6})$/i);
    if (!match) {
      return null;
    }
    const value = parseInt(match[1], 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255, a: 1 };
  }

  // Small bounded memo, so repeated color strings skip re-parsing.
  function createMemo(limit, compute) {
    const cache = new Map();
    return (key) => {
      if (cache.has(key)) {
        return cache.get(key);
      }
      const value = compute(key);
      if (cache.size >= limit) {
        cache.delete(cache.keys().next().value);
      }
      cache.set(key, value);
      return value;
    };
  }

  return {
    TRANSPARENT,
    parseRgbString,
    brightnessOf,
    compositeColors,
    averageColors,
    rgbToHex,
    hexToRgb,
    createMemo
  };
});
