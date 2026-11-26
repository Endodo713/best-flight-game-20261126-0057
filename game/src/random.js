// Sky Courier — seeded randomness.
// One job: deterministic numbers, so the islands, the rings and the weather
// are the same on every run of the same seed. Screenshots stay reproducible.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A tiny value-noise field: smooth enough for hills, cheap enough to call
// per terrain vertex. Two octaves, seeded, no tables to ship.
export function makeNoise2D(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];

  function grad(h, x, y) {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  }
  function fade(t) { return t * t * (3 - 2 * t); }

  function noise(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = grad(perm[perm[xi] + yi], xf, yf);
    const ba = grad(perm[perm[xi + 1] + yi], xf - 1, yf);
    const ab = grad(perm[perm[xi] + yi + 1], xf, yf - 1);
    const bb = grad(perm[perm[xi + 1] + yi + 1], xf - 1, yf - 1);
    const x1 = aa + u * (ba - aa);
    const x2 = ab + u * (bb - ab);
    return x1 + v * (x2 - x1);
  }

  return function fbm(x, y) {
    return noise(x, y) * 0.65 + noise(x * 2.13, y * 2.13) * 0.35;
  };
}

// Small helpers over a seeded stream, so call sites read plainly.
export function makeRandom(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range(min, max) { return min + next() * (max - min); },
    int(min, max) { return min + ((next() * (max - min + 1)) | 0); },
    pick(list) { return list[(next() * list.length) | 0]; },
    chance(p) { return next() < p; },
  };
}
