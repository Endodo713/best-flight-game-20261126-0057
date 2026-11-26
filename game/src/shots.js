// Sky Courier — screenshot poses.
// One job: given ?shot=start|play|cockpit|end, put the game into a fixed,
// good-looking state so the screenshots are real renders of the game's own
// code, taken the same way every time. Nothing here runs during normal play.

import * as THREE from 'three';
import { STRIPS } from './config.js';

// Where the camera sits for each shot, and what the plane is doing.
export const SHOT_POSES = {
  // Title screen: the plane parked on North Field at golden hour, runway
  // ahead, the chain behind her.
  start: {
    camera: 'orbit',
    plane: { strip: 'north', headingOffset: 0.4, throttle: 0 },
    state: 'title',
  },
  // Mid-flight: threading the second ring, chase camera, HUD lit.
  play: {
    camera: 'chase',
    plane: { ring: 1, throttle: 0.72, speed: 46 },
    state: 'flying',
  },
  // Cockpit view: over the nose, instruments big, a ring dead ahead.
  cockpit: {
    camera: 'cockpit',
    plane: { ring: 0, throttle: 0.68, speed: 44 },
    state: 'flying',
  },
  // The landing: on short final to South Strip, gear down, flare just so.
  end: {
    camera: 'chase-low',
    plane: { final: 'south', throttle: 0.4, speed: 26 },
    state: 'flying',
  },
};

export function parseShot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed') || '1');
  if (!shot || !SHOT_POSES[shot]) return null;
  return { name: shot, pose: SHOT_POSES[shot], seed };
}

// Put the flight state on the apron of a strip, facing down the runway.
// The wheels sit on the real ground height, so the plane is never buried
// where the flattening blends out.
export function poseOnStrip(flight, stripKey, headingOffset = 0, heightAt = null) {
  const strip = STRIPS[stripKey];
  const back = strip.length / 2 - 30;
  const x = strip.x - Math.sin(strip.heading) * back;
  const z = strip.z - Math.cos(strip.heading) * back;
  const ground = heightAt ? heightAt(x, z) : 3.2;
  flight.position.set(x, ground + 1.5, z);
  flight.heading = strip.heading + headingOffset;
  flight.pitch = 0;
  flight.bank = 0;
  flight.speed = 0;
  flight.throttle = 0;
  flight.onGround = true;
}

// Put the flight state just behind a ring, flying at it, at cruise height.
// Ninety metres out: the ring is big in the frame but not yet flown.
export function poseNearRing(flight, ring, speed = 46) {
  const back = 90;
  flight.position.set(
    ring.x - Math.sin(ring.heading) * back,
    ring.y + 4,
    ring.z - Math.cos(ring.heading) * back,
  );
  flight.heading = ring.heading;
  flight.pitch = 0.02;
  flight.bank = 0.12;
  flight.speed = speed;
  flight.throttle = 0.7;
  flight.onGround = false;
  flight.fuel = 82;
}

// Put the flight state on short final to a strip: low, slow, lined up.
// A hundred and seventy metres out: the strip fills the view ahead.
export function poseOnFinal(flight, stripKey, speed = 26) {
  const strip = STRIPS[stripKey];
  const back = 170;
  flight.position.set(
    strip.x - Math.sin(strip.heading) * back,
    26,
    strip.z - Math.cos(strip.heading) * back,
  );
  flight.heading = strip.heading;
  flight.pitch = -0.06;
  flight.bank = 0;
  flight.speed = speed;
  flight.throttle = 0.42;
  flight.onGround = false;
  flight.fuel = 34;
}

// Apply a parsed shot to the live game objects. Returns the camera mode
// the shot wants, or null when there is no shot.
export function applyShot(game, shot) {
  if (!shot) return null;
  const { pose } = shot;
  const { flight, mission } = game;
  if (pose.plane.strip) {
    poseOnStrip(flight, pose.plane.strip, pose.plane.headingOffset || 0, game.heightAt || null);
    flight.throttle = pose.plane.throttle;
  } else if (pose.plane.ring !== undefined) {
    const ring = mission.rings[pose.plane.ring];
    poseNearRing(flight, ring, pose.plane.speed);
    mission.nextRing = pose.plane.ring;
    mission.phase = 'enroute';
    mission.score = pose.plane.ring * 100;
  } else if (pose.plane.final) {
    poseOnFinal(flight, pose.plane.final, pose.plane.speed);
    mission.nextRing = mission.rings.length;
    mission.phase = 'landing';
    mission.score = mission.rings.length * 100;
  }
  return pose.camera;
}

export function cameraForShot(mode) {
  return mode || 'chase';
}
