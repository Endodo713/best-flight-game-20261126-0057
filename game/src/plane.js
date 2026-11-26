// Sky Courier — the aircraft and how she flies.
// One job: build the little bush plane out of primitives, and step an
// arcade flight model that is honest about speed, bank and lift.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const LIFT_RED = 0xc23b2e;
const CREAM = 0xf2ead8;
const DARK = 0x2b2f33;

// The plane, built from boxes, cylinders and a spinning prop — no model
// files, so she looks built rather than borrowed. About 9 m long.
export function buildPlane() {
  const group = new THREE.Group();
  group.name = 'courier-plane';
  const paint = new THREE.MeshStandardMaterial({ color: LIFT_RED, roughness: 0.45, metalness: 0.25 });
  const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.5, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.1, metalness: 0.6 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 7.5, 12), paint);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.castShadow = true;
  group.add(fuselage);

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.6, 12), cream);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -4.4;
  nose.castShadow = true;
  group.add(nose);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 10), glass);
  canopy.scale.set(0.95, 0.75, 1.7);
  canopy.position.set(0, 0.55, -1.2);
  group.add(canopy);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.18, 2.1), cream);
  wing.position.set(0, 0.55, -0.6);
  wing.castShadow = true;
  group.add(wing);

  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 2.1), paint);
    tip.position.set(side * 5.6, 0.55, -0.6);
    group.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), dark);
    strut.position.set(side * 2.6, -0.35, -0.6);
    strut.rotation.z = side * 0.5;
    group.add(strut);
  }

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 1.3), cream);
  tailWing.position.set(0, 0.35, 3.4);
  tailWing.castShadow = true;
  group.add(tailWing);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.9, 1.5), paint);
  fin.position.set(0, 0.9, 3.4);
  fin.castShadow = true;
  group.add(fin);

  // Propeller: a hub and two blades that spin with throttle.
  const prop = new THREE.Group();
  prop.position.set(0, 0, -5.3);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 10), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const blades = [];
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.08), dark);
    blade.rotation.z = (i * Math.PI) / 2;
    prop.add(blade);
    blades.push(blade);
  }
  group.add(prop);

  // Fixed gear: two wheels and a tail wheel, so landings read as landings.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 6), dark);
    leg.position.set(side * 1.1, -0.9, -1.4);
    leg.rotation.z = side * 0.35;
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.35, -1.35, -1.4);
    wheel.castShadow = true;
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.18, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.75, 3.6);
  group.add(tailWheel);

  // Navigation lights: red port, green starboard, white tail.
  const navLights = [];
  for (const [x, color] of [[-5.85, 0xff2a2a], [5.85, 0x2aff5a]]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    lamp.position.set(x, 0.55, -0.6);
    group.add(lamp);
    navLights.push(lamp);
  }
  return { group, prop, blades, navLights };
}

// --- Flight state: everything the model needs, nothing it does not.
export function makeFlightState(spawn) {
  return {
    position: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
    heading: spawn.heading,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0.35,
    fuel: 100,
    damage: 0,
    onGround: true,
    verticalSpeed: 0,
    stalled: false,
    airTime: 0,
  };
}

// One physics step. Input: { pitch: -1..1, roll: -1..1, throttle: -1..1 }.
// Wind pushes the airframe sideways; gusts shake the nose a little.
// Returns an event string when something worth a sound or a message happens.
export function stepFlight(state, input, dt, ctx) {
  const c = CONFIG;
  let event = null;

  // Throttle first: the engine answers at every speed.
  state.throttle = THREE.MathUtils.clamp(state.throttle + input.throttle * dt * 0.55, 0, 1);

  // Fuel burns with throttle; an empty tank means a glider.
  const burn = state.throttle < 0.02 ? 0.05 : c.fuelBurnCruise + (c.fuelBurnFull - c.fuelBurnCruise) * state.throttle;
  state.fuel = Math.max(0, state.fuel - burn * dt);
  const thrust = state.fuel > 0 ? state.throttle : 0;

  // Speed: thrust in, drag out. On the ground, rolling resistance holds her.
  const targetSpeed = c.minSpeed + (c.maxSpeed - c.minSpeed) * thrust;
  const accel = thrust * c.accel - c.drag * state.speed * state.speed * 0.12;
  state.speed = Math.max(0, state.speed + accel * dt);
  if (state.onGround) state.speed = Math.min(state.speed, targetSpeed);

  // Attitude: stick moves pitch and bank toward their targets.
  const pitchTarget = THREE.MathUtils.clamp(input.pitch * 0.42, -0.42, 0.42);
  const bankTarget = THREE.MathUtils.clamp(input.roll * c.maxBank, -c.maxBank, c.maxBank);
  const rate = state.onGround ? 2.2 : 1.4;
  state.pitch += (pitchTarget - state.pitch) * Math.min(1, rate * dt);
  state.bank += (bankTarget - state.bank) * Math.min(1, rate * dt);

  // Stall: below min speed the wing quits, the nose drops, the stick goes soft.
  state.stalled = !state.onGround && state.speed < c.minSpeed;
  if (state.stalled) {
    state.pitch = Math.max(state.pitch - 0.35 * dt, -0.3);
    if (!state._stallWarned) { event = 'stall'; state._stallWarned = true; }
  } else {
    state._stallWarned = false;
  }

  // Turn: bank turns the heading, more bank turns it faster.
  state.heading += Math.sin(state.bank) * c.turnRate * (state.speed / c.cruiseSpeed) * dt;

  // Lift: speed and pitch make vertical speed; gravity takes it back.
  const liftFactor = THREE.MathUtils.clamp(state.speed / c.cruiseSpeed, 0, 1.4);
  let vs = Math.sin(state.pitch) * state.speed * c.climbRate * liftFactor;
  if (!state.onGround) vs -= (1 - liftFactor) * 7 * dt * 10;
  if (state.stalled) vs -= 6;
  // Ground effect: the last few metres cushion the sink.
  const groundH = ctx.heightAt(state.position.x, state.position.z);
  const agl = state.position.y - groundH;
  if (!state.onGround && agl < c.groundEffect && vs < 0) vs *= 0.55;
  state.verticalSpeed = vs;

  // Move: forward along the heading, up by the vertical speed, sideways by wind.
  const fx = Math.sin(state.heading);
  const fz = Math.cos(state.heading);
  state.position.x += fx * state.speed * dt + ctx.windX * dt;
  state.position.z += fz * state.speed * dt + ctx.windZ * dt;
  state.position.y += vs * dt;
  if (!state.onGround) state.airTime += dt;

  // Gusts: a little shake on the nose, never a fight with the pilot.
  if (ctx.gusts > 0 && !state.onGround) {
    state.heading += (Math.random() - 0.5) * ctx.gusts * 0.02 * dt * 10;
  }

  // Ground contact: the world decides, the caller judges the landing.
  // Over the sea the floor is the water, not the sea bed.
  const floor = groundH < 0.5 ? 0 : groundH;
  if (state.position.y <= floor + 1.5) {
    state.position.y = floor + 1.5;
    if (!state.onGround) {
      state.onGround = true;
      event = 'touchdown';
    }
    state.verticalSpeed = 0;
  } else if (state.onGround && state.speed > c.minSpeed * 1.25 && state.pitch > 0.06) {
    state.onGround = false;
    event = 'takeoff';
  }
  return event;
}

// Point the visual model at the flight state.
//
// Yaw note: the model's nose is its local -Z, and the flight model flies
// toward (+sin heading, +cos heading). rotateY(heading) would point the
// nose the other way, so the yaw carries +PI. After that flip the local +X
// is the aircraft's true right, so pitch is rotateX(+pitch) (nose up) and
// bank is rotateZ(-bank) (right wing down for a right roll).
export function posePlane(model, state, time) {
  model.group.position.copy(state.position);
  model.group.rotation.set(0, 0, 0);
  model.group.rotateY(state.heading + Math.PI);
  model.group.rotateX(state.pitch);
  model.group.rotateZ(-state.bank);
  // The prop spins with throttle; the nav lights blink once a second.
  model.prop.rotation.z += (0.12 + state.throttle * 2.3) * 0.16;
  const blink = Math.sin(time * 6) > 0;
  for (const lamp of model.navLights) lamp.visible = blink;
}
