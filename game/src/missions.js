// Sky Courier — sorties.
// One job: turn a mission definition into a flyable route (rings in the
// sky, a strip to land on), then judge the flying: rings, landings, fuel,
// damage and the score.

import * as THREE from 'three';
import { CONFIG, MISSIONS, STRIPS } from './config.js';
import { makeRandom } from './random.js';

// Rings hang in the air between the two strips: a gentle arc that climbs,
// turns and descends, so the route reads from the cockpit as a path.
export function planRings(mission, seed) {
  const from = STRIPS[mission.from];
  const to = STRIPS[mission.to];
  const rand = makeRandom(seed * 77 + mission.id * 13);
  const rings = [];
  for (let i = 0; i < mission.rings; i++) {
    const t = (i + 1) / (mission.rings + 1);
    const x = from.x + (to.x - from.x) * t + rand.range(-140, 140);
    const z = from.z + (to.z - from.z) * t + rand.range(-140, 140);
    const arc = Math.sin(t * Math.PI);
    const y = 60 + arc * 90 + rand.range(-12, 12);
    const heading = Math.atan2(to.x - from.x, to.z - from.z);
    rings.push({ x, y, z, heading });
  }
  return rings;
}

export function makeMissionState(missionIndex) {
  const mission = MISSIONS[missionIndex];
  const from = STRIPS[mission.from];
  const spawn = {
    x: from.x,
    y: 4.7,
    z: from.z,
    heading: from.heading,
  };
  return {
    index: missionIndex,
    mission,
    rings: planRings(mission, CONFIG.seed),
    nextRing: 0,
    ringsPassed: 0,
    score: 0,
    timeLeft: mission.timeLimit,
    phase: 'takeoff', // takeoff -> enroute -> landing -> done | failed
    landed: false,
    failedReason: null,
    landingQuality: null,
    startTime: 0,
  };
}

export function ringPassed(state, position) {
  if (state.nextRing >= state.rings.length) return false;
  const ring = state.rings[state.nextRing];
  const dx = position.x - ring.x;
  const dy = position.y - ring.y;
  const dz = position.z - ring.z;
  return dx * dx + dy * dy + dz * dz < CONFIG.ringRadius * CONFIG.ringRadius;
}

// Is the aircraft over the destination strip, low and slow enough to count
// as a landing attempt? The caller judges the touchdown itself.
export function overDestination(state, position) {
  const to = STRIPS[state.mission.to];
  const dx = position.x - to.x;
  const dz = position.z - to.z;
  const along = dx * Math.sin(to.heading) + dz * Math.cos(to.heading);
  const across = dx * Math.cos(to.heading) - dz * Math.sin(to.heading);
  return {
    over: Math.abs(along) < to.length / 2 && Math.abs(across) < to.width / 2 + 8,
    along,
    across,
    strip: to,
  };
}

// Judge a touchdown on the destination strip. Returns null when it was not
// a landing at all (wrong place, still flying), otherwise the verdict.
export function judgeLanding(state, flight, groundInfo) {
  if (!groundInfo.over) return null;
  const speed = flight.speed;
  const sink = -flight.verticalSpeed;
  const verdict = { ok: true, notes: [] };
  if (speed < CONFIG.landingSpeedMin) { verdict.ok = false; verdict.notes.push('too slow — she dropped'); }
  if (speed > CONFIG.landingSpeedMax) { verdict.ok = false; verdict.notes.push('too fast for the strip'); }
  if (sink > CONFIG.landingSinkMax) { verdict.ok = false; verdict.notes.push('too hard — the gear took it'); }
  if (Math.abs(groundInfo.across) > STRIPS[state.mission.to].width / 2) {
    verdict.ok = false;
    verdict.notes.push('off the centreline');
  }
  verdict.speed = speed;
  verdict.sink = sink;
  verdict.across = groundInfo.across;
  verdict.quality = verdict.ok
    ? (sink < 2 && Math.abs(groundInfo.across) < 4 ? 'greaser' : 'firm but fair')
    : 'rough';
  return verdict;
}

export function scoreLanding(state, verdict) {
  let points = CONFIG.landingScore;
  if (verdict.quality === 'greaser') points += 150;
  if (Math.abs(verdict.across) < 4) points += CONFIG.centrelineBonus;
  points += Math.round(state.timeLeft) * CONFIG.timeBonusPerSec;
  return points;
}

// What the HUD should say right now.
export function objectiveText(state) {
  const m = state.mission;
  if (state.phase === 'takeoff') return `Take off from ${STRIPS[m.from].name} — throttle up, ease back`;
  if (state.phase === 'enroute') {
    if (state.nextRing < state.rings.length) {
      return `Thread ring ${state.nextRing + 1} of ${state.rings.length} — then land at ${STRIPS[m.to].name}`;
    }
    return `All rings flown — land at ${STRIPS[m.to].name}, slow and on the centreline`;
  }
  if (state.phase === 'landing') return 'Flare… hold her off… touch down soft';
  if (state.phase === 'done') return 'Sortie complete — the mail is through';
  return state.failedReason || 'Sortie failed';
}

// Advance the mission clock and the phase. Returns event strings for the
// caller to turn into sounds and messages.
export function stepMission(state, flight, dt) {
  const events = [];
  state.timeLeft -= dt;
  if (state.timeLeft <= 0 && state.phase !== 'done' && state.phase !== 'failed') {
    state.phase = 'failed';
    state.failedReason = 'Out of time — the strip closed at dusk';
    events.push('failed');
    return events;
  }
  if (state.phase === 'takeoff' && !flight.onGround) {
    state.phase = 'enroute';
    events.push('airborne');
  }
  if (state.phase === 'enroute' && state.nextRing >= state.rings.length) {
    state.phase = 'landing';
    events.push('all-rings');
  }
  if (flight.fuel <= 0 && !flight.onGround) {
    state.phase = 'failed';
    state.failedReason = 'Out of fuel — she became a glider over the sea';
    events.push('failed');
  }
  if (flight.damage >= 100) {
    state.phase = 'failed';
    state.failedReason = 'Airframe written off — too many hard knocks';
    events.push('failed');
  }
  return events;
}
