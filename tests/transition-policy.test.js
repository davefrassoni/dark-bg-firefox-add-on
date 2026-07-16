const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BRIGHTNESS_BRIGHT,
  BRIGHTNESS_DARK,
  normalizeBrightness,
  shouldFadeTransition
} = require("../shared/transition-policy.js");

test("fades only when moving from dark to bright", () => {
  const cases = [
    [BRIGHTNESS_DARK, BRIGHTNESS_BRIGHT, true],
    [BRIGHTNESS_BRIGHT, BRIGHTNESS_BRIGHT, false],
    [BRIGHTNESS_BRIGHT, BRIGHTNESS_DARK, false],
    [BRIGHTNESS_DARK, BRIGHTNESS_DARK, false]
  ];

  for (const [previous, next, expected] of cases) {
    assert.equal(
      shouldFadeTransition(previous, next),
      expected,
      `${previous} -> ${next}`
    );
  }
});

test("unknown incoming brightness is handled conservatively", () => {
  assert.equal(shouldFadeTransition(null, BRIGHTNESS_BRIGHT), true);
  assert.equal(shouldFadeTransition(undefined, BRIGHTNESS_DARK), false);
});

test("invalid brightness values normalize to unknown", () => {
  assert.equal(normalizeBrightness("dim"), null);
  assert.equal(normalizeBrightness(BRIGHTNESS_BRIGHT), BRIGHTNESS_BRIGHT);
  assert.equal(normalizeBrightness(BRIGHTNESS_DARK), BRIGHTNESS_DARK);
});
