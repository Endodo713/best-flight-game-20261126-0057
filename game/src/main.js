// Sky Courier — bootstrap, loop and state machine.
// One job: own the game. It builds the renderer, the world, the plane and
// the HUD, runs the loop, and moves between title, flying, paused and
// debrief. Everything else is a module with one job.

import * as THREE from 'three';
import { CONFIG, MISSIONS, STRIPS } from './config.js';
import { buildWorld, buildTrees, buildRunways, buildRings, setRingState } from './world.js';
import { buildPlane, makeFlightState, stepFlight, posePlane } from './plane.js';
import { buildHud, updateHud, showMessage, showToast } from './hud.js';
import { makeMissionState, ringPassed, overDestination, judgeLanding, scoreLanding, objectiveText, stepMission } from './missions.js';
import { makeAudio, makeOneShots } from './audio.js';
import { makeInput, makeButton, makeMouseSteering } from './input.js';
import { parseShot, applyShot } from './shots.js';

const game = {
  state: 'title', // title | flying | paused | debrief
  missionIndex: 0,
  mission: null,
  flight: null,
  cameraMode: 'chase',
  shot: null,
  muted: false,
};

let renderer;
let scene;
let camera;
let world;
let planeModel;
let rings = [];
let hud;
let input;
let mouse;
let audio;
let sfx;
let clock;

function overAnyStrip(position) {
  for (const [key, strip] of Object.entries(STRIPS)) {
    const dx = position.x - strip.x;
    const dz = position.z - strip.z;
    const along = dx * Math.sin(strip.heading) + dz * Math.cos(strip.heading);
    const across = dx * Math.cos(strip.heading) - dz * Math.sin(strip.heading);
    if (Math.abs(along) < strip.length / 2 + 4 && Math.abs(across) < strip.width / 2 + 4) return key;
  }
  return null;
}

function startMission(index) {
  game.missionIndex = index;
  game.mission = makeMissionState(index);
  const spawn = {
    x: STRIPS[game.mission.mission.from].x,
    y: 4.7,
    z: STRIPS[game.mission.mission.from].z,
    heading: STRIPS[game.mission.mission.from].heading,
  };
  game.flight = makeFlightState(spawn);
  game.flight.fuel = game.mission.mission.fuel;
  // Rebuild the rings for this sortie.
  for (const r of rings) r.mesh.parent?.remove(r.mesh);
  rings = buildRings(world.group, game.mission.rings);
  setRingState(rings, 0);
  // The light follows the sortie: dusk for Storm Courier, noon for the rest.
  const el = (game.mission.mission.sunElevation * Math.PI) / 180;
  const sun = world.group.children.find((c) => c.isDirectionalLight);
  if (sun) sun.position.set(Math.cos(el) * 800, Math.sin(el) * 800, 300);
  scene.fog.near = CONFIG.fogNear * (1 + game.mission.mission.fog);
  scene.fog.far = CONFIG.fogFar * (1 - game.mission.mission.fog * 0.4);
  game.state = 'flying';
  game.cameraMode = 'chase';
  hideScreens();
  if (!game.shot) showMessage(hud, `${game.mission.mission.name} — ${game.mission.mission.brief}`, 4200);
  audio.resume();
}

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hideScreens() {
  for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
}

function buildScreens() {
  // Title: the game, the three sorties, the controls.
  const title = document.getElementById('screen-title');
  title.innerHTML = `
    <h1>SKY COURIER</h1>
    <p class="tagline">Bush mail over the Merpati chain. Fly the rings, mind the fuel, bring her down soft.</p>
    <div class="mission-list">
      ${MISSIONS.map((m, i) => `
        <button class="mission-card" data-mission="${i}">
          <span class="mission-num">SORTIE ${m.id}</span>
          <span class="mission-name">${m.name}</span>
          <span class="mission-brief">${m.brief}</span>
          <span class="mission-meta">${m.rings} rings &middot; ${STRIPS[m.to].name} &middot; ${m.timeLimit / 60} min</span>
        </button>`).join('')}
    </div>
    <p class="controls">Arrows pitch &amp; bank &middot; W/S throttle &middot; G camera &middot; P pause &middot; R restart &middot; M mute &middot; mouse drag steers too</p>
  `;
  title.querySelectorAll('[data-mission]').forEach((b) => {
    b.addEventListener('click', () => {
      sfx.click();
      startMission(Number(b.dataset.mission));
    });
  });

  // Debrief: filled in when a sortie ends.
  const debrief = document.getElementById('screen-debrief');
  debrief.innerHTML = `
    <h1 id="debrief-title">SORTIE COMPLETE</h1>
    <p id="debrief-text" class="tagline"></p>
    <div id="debrief-stats" class="debrief-stats"></div>
    <div class="menu-row">
      <button id="debrief-next" class="menu-button primary">Next sortie</button>
      <button id="debrief-retry" class="menu-button">Fly it again</button>
      <button id="debrief-title-btn" class="menu-button">Title screen</button>
    </div>
  `;
  document.getElementById('debrief-next').addEventListener('click', () => {
    sfx.click();
    startMission(Math.min(game.missionIndex + 1, MISSIONS.length - 1));
  });
  document.getElementById('debrief-retry').addEventListener('click', () => {
    sfx.click();
    startMission(game.missionIndex);
  });
  document.getElementById('debrief-title-btn').addEventListener('click', () => {
    sfx.click();
    toTitle();
  });

  // Pause.
  const pause = document.getElementById('screen-pause');
  pause.innerHTML = `
    <h1>PAUSED</h1>
    <p class="tagline">The mail can wait a minute. It usually does.</p>
    <div class="menu-row">
      <button id="pause-resume" class="menu-button primary">Resume</button>
      <button id="pause-restart" class="menu-button">Restart sortie</button>
      <button id="pause-quit" class="menu-button">Title screen</button>
    </div>
  `;
  document.getElementById('pause-resume').addEventListener('click', () => { sfx.click(); resumeGame(); });
  document.getElementById('pause-restart').addEventListener('click', () => { sfx.click(); startMission(game.missionIndex); });
  document.getElementById('pause-quit').addEventListener('click', () => { sfx.click(); toTitle(); });
}

function toTitle() {
  game.state = 'title';
  startMission(0);
  game.state = 'title';
  showScreen('screen-title');
  game.cameraMode = 'orbit';
}

function resumeGame() {
  game.state = 'flying';
  hideScreens();
}

function endSortie(done, title, text, stats) {
  game.state = 'debrief';
  document.getElementById('debrief-title').textContent = title;
  document.getElementById('debrief-text').textContent = text;
  document.getElementById('debrief-stats').innerHTML = stats
    .map(([k, v]) => `<div class="stat"><span class="stat-k">${k}</span><span class="stat-v">${v}</span></div>`)
    .join('');
  document.getElementById('debrief-next').style.display =
    done && game.missionIndex < MISSIONS.length - 1 ? '' : 'none';
  if (done) sfx.success();
  else sfx.fail();
  showScreen('screen-debrief');
}

function handleTouchdown() {
  const m = game.mission;
  const f = game.flight;
  sfx.thud();
  const ground = overDestination(m, f.position);
  const strip = overAnyStrip(f.position);
  if (ground.over) {
    const verdict = judgeLanding(m, f, ground);
    if (verdict.ok) {
      const points = scoreLanding(m, verdict);
      m.score += points;
      m.phase = 'done';
      m.landed = true;
      m.landingQuality = verdict.quality;
      endSortie(true, 'SORTIE COMPLETE',
        `${verdict.quality === 'greaser' ? 'A greaser. ' : ''}Down safe at ${STRIPS[m.mission.to].name} — the mail is through.`,
        [['Rings', `${m.ringsPassed} / ${m.rings.length}`],
         ['Landing', `${verdict.quality} (+${points} pts)`],
         ['Fuel left', `${Math.round(f.fuel)}%`],
         ['Time left', `${Math.round(m.timeLeft)}s`],
         ['Score', m.score.toLocaleString('en-US')]]);
    } else {
      f.damage += CONFIG.damageHardLanding;
      showMessage(hud, `Rough landing: ${verdict.notes.join(', ')} — airframe ${Math.round(f.damage)}% damaged`, 3600);
      if (f.damage >= 100) {
        m.phase = 'failed';
        m.failedReason = 'Airframe written off on the strip';
        endSortie(false, 'SORTIE FAILED', m.failedReason, [['Score', m.score]]);
      } else {
        showToast(hud, 'She is still flyable — throttle up and go around');
      }
    }
  } else if (strip) {
    showMessage(hud, `Back on the ground at ${STRIPS[strip].name} — not your destination, but solid earth`, 3200);
  } else {
    // Down in the rough, or in the drink.
    const groundH = world.heightAt(f.position.x, f.position.z);
    const ditched = groundH < 1;
    f.damage = 100;
    m.phase = 'failed';
    m.failedReason = ditched
      ? 'Ditched in the lagoon — the mail got wet'
      : 'Down in the rough — the strip was somewhere else';
    endSortie(false, 'SORTIE FAILED', m.failedReason, [['Score', m.score]]);
  }
}

function updateCamera(dt) {
  const f = game.flight;
  const target = new THREE.Vector3();
  // In a screenshot pose the camera snaps: a lerping camera is still
  // travelling when the shutter falls, and the plane reads as a speck.
  const snap = !!game.shot;
  const lerp = (k) => Math.min(1, snap ? 1 : dt * k);
  if (game.cameraMode === 'cockpit') {
    // The cockpit sits just behind the nose; it looks where the nose
    // points, so both the offset and the look rotate by heading + PI, the
    // same flip the model's yaw carries. The view rolls with the bank:
    // a right bank tips the pilot's up to the right, rotation.z negative.
    const offset = new THREE.Vector3(0, 1.05, -0.9);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), f.heading + Math.PI);
    target.copy(f.position).add(offset);
    camera.position.lerp(target, lerp(18));
    const look = new THREE.Vector3(0, 0.55, -30);
    look.applyAxisAngle(new THREE.Vector3(0, 1, 0), f.heading + Math.PI);
    look.applyAxisAngle(new THREE.Vector3(1, 0, 0), -f.pitch);
    camera.lookAt(f.position.clone().add(look));
    camera.rotation.z -= f.bank * 0.6;
  } else if (game.cameraMode === 'orbit') {
    // The orbit drifts around the parked plane on the title screen. In a
    // shot it stands off further and aims below the nose, so the plane
    // lands in the clear sky above the title block instead of behind it.
    const t = game.shot ? f.heading + 0.7 : performance.now() * 0.00008;
    const r = game.shot ? 30 : 26;
    target.set(
      f.position.x + Math.sin(t) * r,
      f.position.y + (game.shot ? 8 : 9),
      f.position.z + Math.cos(t) * r,
    );
    camera.position.lerp(target, lerp(2));
    const fwd = game.shot ? 6 : 25;
    const up = game.shot ? -4 : 1;
    const ahead = new THREE.Vector3(Math.sin(f.heading) * fwd, up, Math.cos(f.heading) * fwd);
    camera.lookAt(f.position.clone().add(ahead));
  } else {
    const low = game.cameraMode === 'chase-low';
    const back = low ? 11 : CONFIG.cameraChaseDistance;
    const up = low ? 2.2 : CONFIG.cameraChaseHeight;
    const offset = new THREE.Vector3(-Math.sin(f.heading) * back, up, -Math.cos(f.heading) * back);
    target.copy(f.position).add(offset);
    camera.position.lerp(target, lerp(low ? 8 : 5));
    const look = f.position.clone();
    look.y += 1;
    look.x += Math.sin(f.heading) * 14;
    look.z += Math.cos(f.heading) * 14;
    camera.lookAt(look);
  }
}

function step(dt, time) {
  const m = game.mission;
  const f = game.flight;

  if (game.state === 'flying') {
    // Keys that act once, not while held.
    if (input.wasPressed(['KeyG'])) {
      game.cameraMode = game.cameraMode === 'cockpit' ? 'chase' : 'cockpit';
      showToast(hud, game.cameraMode === 'cockpit' ? 'Cockpit view' : 'Chase view');
    }
    if (input.wasPressed(['KeyP', 'Escape'])) {
      game.state = 'paused';
      showScreen('screen-pause');
    }
    if (input.wasPressed(['KeyR'])) startMission(game.missionIndex);
    if (input.wasPressed(['KeyM'])) {
      game.muted = !game.muted;
      audio.setMuted(game.muted);
      showToast(hud, game.muted ? 'Sound off' : 'Sound on');
    }

    // The stick: keyboard plus mouse drag, blended.
    const kb = input.readFlight();
    const ms = mouse.read();
    const stick = {
      pitch: THREE.MathUtils.clamp(kb.pitch + ms.pitch, -1, 1),
      roll: THREE.MathUtils.clamp(kb.roll + ms.roll, -1, 1),
      throttle: kb.throttle,
    };
    const wind = m.mission.wind;
    const windRad = Math.PI / 2; // crosswind from the west
    const ctx = {
      heightAt: world.heightAt,
      windX: Math.cos(windRad) * wind,
      windZ: Math.sin(windRad) * wind * 0.2,
      gusts: m.mission.gusts,
    };
    const event = stepFlight(f, stick, dt, ctx);
    if (event === 'takeoff') {
      sfx.takeoff();
      showMessage(hud, 'Airborne — gear up in spirit, rings ahead');
    } else if (event === 'touchdown') {
      handleTouchdown();
    } else if (event === 'stall') {
      sfx.stall();
    }

    // Rings, in order: fly through the next one and it counts.
    if (m.phase === 'enroute' && ringPassed(m, f.position)) {
      const r = rings[m.nextRing];
      if (r) r.passed = true;
      m.nextRing++;
      m.ringsPassed++;
      m.score += CONFIG.ringScore;
      setRingState(rings, m.nextRing);
      sfx.ring();
      showToast(hud, `Ring ${m.ringsPassed} of ${m.rings.length} — +${CONFIG.ringScore}`);
    }

    for (const e of stepMission(m, f, dt)) {
      if (e === 'all-rings') showMessage(hud, 'All rings flown — bring her home to the strip', 3600);
      if (e === 'failed') {
        endSortie(false, 'SORTIE FAILED', m.failedReason || 'Sortie failed', [['Score', m.score]]);
      }
    }
    audio.update(f.throttle, f.speed, f.onGround);
  }

  // The world keeps moving even on the title screen.
  for (const cloud of world.clouds.children) {
    cloud.position.x += dt * 2.2;
    if (cloud.position.x > HALF_WORLD) cloud.position.x = -HALF_WORLD;
  }
  for (const r of rings) {
    if (!r.passed && rings.indexOf(r) === m.nextRing) {
      const s = 1 + Math.sin(time * 3) * 0.06;
      r.mesh.scale.setScalar(s);
    }
  }
  posePlane(planeModel, f, time);
  updateCamera(dt);
  if (m) {
    updateHud(hud, f, {
      missionName: `${m.mission.name} — Sortie ${m.mission.id}`,
      objective: objectiveText(m),
      timeLeft: m.timeLeft,
      score: m.score,
      rings: m.rings.map((_, i) => i < m.nextRing),
      nextRing: m.nextRing,
    });
  }
  input.endFrame();
}

const HALF_WORLD = CONFIG.worldSize / 2;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  step(dt, time);
  renderer.render(scene, camera);
}

function init() {
  const container = document.getElementById('game');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 4000);
  camera.position.set(-640, 40, -560);

  world = buildWorld(scene, CONFIG.seed);
  buildTrees(world.group, world.heightAt, CONFIG.seed);
  buildRunways(world.group, world.heightAt);

  planeModel = buildPlane();
  scene.add(planeModel.group);

  hud = buildHud(document.getElementById('ui'));
  input = makeInput();
  mouse = makeMouseSteering(renderer.domElement);
  audio = makeAudio();
  sfx = makeOneShots(audio);
  buildScreens();
  clock = new THREE.Clock();

  // The shot is parsed before the first mission starts, so the title flow
  // knows to stay quiet while a screenshot pose is being taken.
  game.shot = parseShot();

  // Mission 1 on the apron, title screen over it.
  startMission(0);
  game.state = 'title';
  game.cameraMode = 'orbit';
  showScreen('screen-title');

  // A screenshot pose overrides the title flow with a fixed, good-looking state.
  game.heightAt = world.heightAt;
  if (game.shot) {
    const mode = applyShot(game, game.shot);
    game.cameraMode = mode;
    // Rings the pose already flew stay green, the next one stays amber.
    for (let i = 0; i < game.mission.nextRing; i++) {
      if (rings[i]) rings[i].passed = true;
    }
    setRingState(rings, game.mission.nextRing);
    if (game.shot.name === 'start') {
      // The title screen itself is the shot: parked plane, menu over it.
      // The menu drops to the bottom so the plane shows in the clear sky.
      document.body.classList.add('shot-start');
      game.state = 'title';
      game.cameraMode = 'orbit';
      showScreen('screen-title');
    } else {
      game.state = 'flying';
      hideScreens();
    }
    // In a shot the pilot is a ghost: no input, and the clock reads the
    // mission's own limit instead of a frozen 15:00.
    game.mission.timeLeft = game.mission.mission.timeLimit;
    audio.setMuted(true);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  document.addEventListener('pointerdown', () => audio.resume(), { once: true });
  document.addEventListener('keydown', () => audio.resume(), { once: true });

  // A debug handle, only when ?debug is in the URL: the playtest drives the
  // game through it. Normal play never sees it.
  if (new URLSearchParams(window.location.search).has('debug')) {
    window.__sky = {
      game,
      get rings() { return rings; },
      get flight() { return game.flight; },
      get mission() { return game.mission; },
      world,
      startMission,
    };
  }

  loop();
}

init();
