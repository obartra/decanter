/* Deterministic RNG. Level N must generate the same puzzle on every device and
   every run, otherwise stars and best scores on the map mean nothing. */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* avalanche so adjacent level numbers give unrelated boards */
function hashSeed(n){
  let h = (2166136261 ^ n) >>> 0;
  h = Math.imul(h, 16777619) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 16777619) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
function shuffleWith(rng, arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
globalThis.RNG = { mulberry32, hashSeed, shuffleWith };
