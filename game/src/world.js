// Sky Courier — the island chain.
// One job: build the world the pilot flies over, and answer "how high is
// the ground here?" for the flight model. Terrain, sea, sky, clouds, trees,
// runways and rings; everything seeded, so seed 1 always builds the same
// Merpati chain.

import * as THREE from 'three';
import { CONFIG, STRIPS } from './config.js';
import { makeNoise2D, makeRandom } from './random.js';

const SIZE = CONFIG.worldSize;
const HALF = SIZE / 2;

// Island shape: a chain of three humps that falls away into the sea.
function islandMask(x, z) {
  const d1 = Math.hypot(x + 500, z + 480) / 620;
  const d2 = Math.hypot(x - 80, z + 60) / 700;
  const d3 = Math.hypot(x - 620, z - 560) / 560;
  const d = Math.min(d1, d2, d3);
  return THREE.MathUtils.clamp(1.15 - d * d, 0, 1);
}

export function makeHeightAt(seed) {
  const noise = makeNoise2D(seed);
  return function heightAt(x, z) {
    const mask = islandMask(x, z);
    if (mask <= 0) return -6; // sea floor, well under the water
    const n = noise(x * 0.0016 + 7.3, z * 0.0016 + 2.9);
    const n2 = noise(x * 0.006 + 1.7, z * 0.006 + 8.4);
    let h = 4 + n * 55 + n2 * 14;
    h *= mask;
    // Flatten the ground under each airstrip so landings are fair: dead
    // flat across the whole strip, blending out over ~45 m past its ends.
    // Axes: forward is (sin heading, cos heading), the runway's long axis;
    // across is its perpendicular (cos heading, -sin heading).
    for (const strip of Object.values(STRIPS)) {
      const dx = x - strip.x;
      const dz = z - strip.z;
      const along = dx * Math.sin(strip.heading) + dz * Math.cos(strip.heading);
      const across = dx * Math.cos(strip.heading) - dz * Math.sin(strip.heading);
      const m = Math.max(Math.abs(along) / (strip.length / 2), Math.abs(across) / (strip.width / 2));
      if (m < 1.35) {
        const flat = THREE.MathUtils.clamp(1 - (m - 1) / 0.35, 0, 1);
        h = h * (1 - flat) + 3.2 * flat;
      }
    }
    return h;
  };
}

function terrainColor(h, noiseVal) {
  const sand = new THREE.Color(0xd9c28a);
  const grass = new THREE.Color(0x5d8a3c);
  const deep = new THREE.Color(0x3d6b2a);
  const rock = new THREE.Color(0x8a7f74);
  const c = new THREE.Color();
  if (h < 5) c.copy(sand);
  else if (h < 26) c.copy(grass).lerp(deep, THREE.MathUtils.clamp((h - 5) / 21, 0, 1));
  else if (h < 52) c.copy(deep).lerp(rock, THREE.MathUtils.clamp((h - 26) / 26, 0, 1) * 0.6);
  else c.copy(rock);
  const shade = 0.92 + noiseVal * 0.16;
  c.multiplyScalar(shade);
  return c;
}

export function buildWorld(scene, seed) {
  const heightAt = makeHeightAt(seed);
  const rand = makeRandom(seed * 31 + 7);
  const group = new THREE.Group();
  group.name = 'world';

  // --- Terrain: a displaced grid with painted vertex colours.
  const SEG = 128;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const noise = makeNoise2D(seed + 5);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const c = terrainColor(h, noise(x * 0.01, z * 0.01));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
  );
  terrain.name = 'terrain';
  terrain.receiveShadow = true;
  group.add(terrain);

  // --- Sea: a calm sheet just under the beaches.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE * 2.2, SIZE * 2.2),
    new THREE.MeshStandardMaterial({ color: 0x2a7fae, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = CONFIG.seaLevel;
  sea.name = 'sea';
  group.add(sea);

  // --- Sky light: sun, hemisphere, fog that sells the distance.
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  const el = (CONFIG.sunElevation * Math.PI) / 180;
  sun.position.set(Math.cos(el) * 800, Math.sin(el) * 800, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 2600;
  group.add(sun);
  group.add(new THREE.HemisphereLight(0xbfd9e8, 0x4a6b3a, 1.1));
  scene.fog = new THREE.Fog(0xc4d8e6, CONFIG.fogNear, CONFIG.fogFar);
  scene.background = new THREE.Color(0x9fc6dd);

  // --- Clouds: soft white blobs drifting slowly over the chain.
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  const clouds = new THREE.Group();
  clouds.name = 'clouds';
  for (let i = 0; i < 26; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + rand.int(0, 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand.range(14, 30), 10, 8), cloudMat);
      s.position.set(rand.range(-26, 26), rand.range(-4, 6), rand.range(-12, 12));
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set(rand.range(-HALF, HALF), rand.range(150, 260), rand.range(-HALF, HALF));
    clouds.add(cloud);
  }
  group.add(clouds);

  scene.add(group);
  return { group, heightAt, clouds };
}

// --- Trees: instanced palms and pines, kept off the strips and the sea.
export function buildTrees(parent, heightAt, seed) {
  const rand = makeRandom(seed * 101 + 3);
  const COUNT = 420;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 7, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const crownGeo = new THREE.ConeGeometry(4.2, 13, 7);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f6b2f, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, COUNT);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < 4000) {
    const x = rand.range(-HALF + 60, HALF - 60);
    const z = rand.range(-HALF + 60, HALF - 60);
    const h = heightAt(x, z);
    if (h < 5.5 || h > 60) continue;
    let onStrip = false;
    for (const strip of Object.values(STRIPS)) {
      if (Math.hypot(x - strip.x, z - strip.z) < strip.length * 0.75) { onStrip = true; break; }
    }
    if (onStrip) continue;
    const s = rand.range(0.7, 1.5);
    dummy.position.set(x, h + 3.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.y = rand.range(0, Math.PI * 2);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + (7 + 6.5) * s;
    dummy.updateMatrix();
    crowns.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  trunks.castShadow = true;
  crowns.castShadow = true;
  parent.add(trunks);
  parent.add(crowns);
  return placed;
}

// --- Runways: a dark strip with centreline dashes, threshold bars and a
// windsock, laid flat on the flattened ground.
export function buildRunways(parent, heightAt) {
  const runways = new THREE.Group();
  runways.name = 'runways';
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.9 });
  const paint = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  for (const strip of Object.values(STRIPS)) {
    const g = new THREE.Group();
    const y = heightAt(strip.x, strip.z) + 0.15;
    const stripMesh = new THREE.Mesh(new THREE.PlaneGeometry(strip.width, strip.length), asphalt);
    stripMesh.rotation.x = -Math.PI / 2;
    stripMesh.receiveShadow = true;
    g.add(stripMesh);
    const dashCount = Math.floor(strip.length / 24);
    for (let i = 0; i < dashCount; i++) {
      if (i % 2 === 0) continue;
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 10), paint);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.05, -strip.length / 2 + 12 + i * 24);
      g.add(dash);
    }
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(strip.width * 0.8, 3), paint);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(0, 0.05, side * (strip.length / 2 - 8));
      g.add(bar);
    }
    // Windsock on a pole beside the threshold.
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 9, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }),
    );
    pole.position.set(strip.width / 2 + 8, 4.5, -strip.length / 2 + 6);
    g.add(pole);
    const sock = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8 }),
    );
    sock.rotation.z = Math.PI / 2;
    sock.position.set(strip.width / 2 + 8, 8.6, -strip.length / 2 + 6);
    g.add(sock);
    g.position.set(strip.x, y, strip.z);
    g.rotation.y = strip.heading;
    runways.add(g);
  }
  parent.add(runways);
  return runways;
}

// --- Target rings: glowing hoops the pilot threads in order. The next one
// pulses amber; flown ones turn green; the rest stay dim blue.
export function buildRings(parent, positions) {
  const group = new THREE.Group();
  group.name = 'rings';
  const rings = positions.map((p, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a6fd8, emissive: 0x1a4a8a, emissiveIntensity: 0.9,
      roughness: 0.4, metalness: 0.2, transparent: true, opacity: 0.95,
    });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(CONFIG.ringRadius, 1.1, 12, 40), mat);
    mesh.position.set(p.x, p.y, p.z);
    mesh.rotation.y = p.heading ?? 0;
    mesh.userData.index = i;
    group.add(mesh);
    return { mesh, mat, position: p, passed: false };
  });
  parent.add(group);
  return rings;
}

export function setRingState(rings, nextIndex) {
  rings.forEach((r, i) => {
    if (r.passed) {
      r.mat.color.set(0x2fae4e);
      r.mat.emissive.set(0x1d7a33);
      r.mat.emissiveIntensity = 0.7;
    } else if (i === nextIndex) {
      r.mat.color.set(0xff9a1a);
      r.mat.emissive.set(0xff7a00);
      r.mat.emissiveIntensity = 1.6;
    } else {
      r.mat.color.set(0x2a6fd8);
      r.mat.emissive.set(0x1a4a8a);
      r.mat.emissiveIntensity = 0.9;
    }
  });
}
