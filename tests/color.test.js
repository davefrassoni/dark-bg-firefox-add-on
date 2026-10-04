const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseRgbString,
  brightnessOf,
  compositeColors,
  averageColors,
  rgbToHex,
  hexToRgb,
  createMemo
} = require("../shared/color.js");

test("parses computed-style rgb and rgba forms", () => {
  assert.deepEqual(parseRgbString("rgb(1, 2, 3)"), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseRgbString("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseRgbString("rgb(10 20 30 / 25%)"), { r: 10, g: 20, b: 30, a: 0.25 });
  assert.equal(parseRgbString("oklch(0.5 0.1 200)"), null);
  assert.equal(parseRgbString(null), null);
});

test("brightness uses perceptual weights", () => {
  assert.equal(brightnessOf({ r: 255, g: 255, b: 255 }), 255);
  assert.equal(brightnessOf({ r: 0, g: 0, b: 0 }), 0);
  assert.ok(brightnessOf({ r: 0, g: 255, b: 0 }) > brightnessOf({ r: 0, g: 0, b: 255 }));
});

test("compositing a half-transparent color over white", () => {
  const result = compositeColors({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(Math.round(result.r), 128);
  assert.equal(result.a, 1);
});

test("averages and hex conversion round-trip", () => {
  const average = averageColors([
    { r: 0, g: 0, b: 0, a: 1 },
    { r: 255, g: 255, b: 255, a: 1 }
  ]);
  assert.equal(rgbToHex(average), "#808080");
  assert.equal(averageColors([]), null);
  assert.deepEqual(hexToRgb("#1a2b3c"), { r: 26, g: 43, b: 60, a: 1 });
  assert.equal(hexToRgb("blue"), null);
});

test("memo caches results and stays bounded", () => {
  let calls = 0;
  const memo = createMemo(2, (key) => {
    calls += 1;
    return key.length;
  });
  memo("a");
  memo("a");
  assert.equal(calls, 1);
  memo("bb");
  memo("ccc");
  memo("a");
  assert.equal(calls, 4);
});
