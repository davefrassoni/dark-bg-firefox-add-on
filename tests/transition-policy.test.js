const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BRIGHTNESS_BRIGHT,
  BRIGHTNESS_DARK,
  normalizeBrightness,
  shouldFadeTransition,
  planGuardMessages
} = require("../shared/transition-policy.js");

test("guards are armed only on background tabs that would flash", () => {
  const tabs = [
    { id: 1, active: true },
    { id: 2, active: false },
    { id: 3, active: false },
    { id: 4, active: false }
  ];
  const brightness = { 1: "dark", 2: "bright", 3: "dark", 4: null };
  assert.deepEqual(planGuardMessages(tabs, brightness, "dark", {}), [
    { tabId: 1, armed: false },
    { tabId: 2, armed: true },
    { tabId: 3, armed: false },
    { tabId: 4, armed: false }
  ]);
  // Coming from a bright tab, nothing needs a guard.
  assert.deepEqual(
    planGuardMessages(tabs, brightness, "bright", { 1: false, 2: true, 3: false, 4: false }),
    [{ tabId: 2, armed: false }]
  );
});

test("unchanged guard states send no messages", () => {
  const tabs = [{ id: 1, active: false }];
  assert.deepEqual(planGuardMessages(tabs, { 1: "bright" }, "dark", { 1: true }), []);
});

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
