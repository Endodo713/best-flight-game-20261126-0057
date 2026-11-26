// Sky Courier — tuning constants and mission data.
// One job: every number the rest of the game agrees on lives here.

export const CONFIG = {
  // World: one island chain, about 2.4 km across, sea all around.
  worldSize: 2400,
  seaLevel: 0,
  seed: 1,

  // Flight model (arcade, but honest: speed makes lift, bank makes turn).
  minSpeed: 12,          // m/s — below this the wing quits (stall)
  cruiseSpeed: 42,       // m/s at 70% throttle, level
  maxSpeed: 78,          // m/s at full throttle, level
  accel: 9,              // m/s^2 at full throttle
  drag: 0.055,           // 1/s speed bleed
  climbRate: 0.55,       // vertical speed per unit pitch, scaled by speed
  pitchRate: 0.9,        // rad/s at full stick
  rollRate: 1.6,         // rad/s at full stick
  turnRate: 0.55,        // heading rad/s at full bank
  maxBank: 1.1,          // rad
  groundEffect: 6,       // metres above ground where the flare helps

  // Fuel and damage: the decisions in a sortie.
  fuelCapacity: 100,
  fuelBurnCruise: 0.55,  // units per second at cruise throttle
  fuelBurnFull: 1.15,    // units per second at full throttle
  damageHardLanding: 34, // one bad touchdown
  damageCrash: 100,      // terrain strike or ditching

  // Rings and landing windows.
  ringRadius: 16,        // metres, generous on purpose
  ringScore: 100,
  landingSpeedMin: 16,   // m/s — slower and she drops out of the sky
  landingSpeedMax: 38,   // m/s — faster and the gear complains
  landingSinkMax: 4.5,   // m/s descent at touchdown
  landingScore: 400,
  centrelineBonus: 150,
  timeBonusPerSec: 5,

  // Presentation.
  skyTop: 0x2f6fb4,
  skyHorizon: 0xbfd9e8,
  fogNear: 350,
  fogFar: 1600,
  sunElevation: 38,      // degrees, sortie 1
  cameraChaseDistance: 16,
  cameraChaseHeight: 4.5,
};

// The three sorties. Each one: a strip to leave, rings to thread in order,
// a strip to land on, weather, and the light that sells it.
export const MISSIONS = [
  {
    id: 1,
    name: 'First Light',
    brief: 'North Field to South Strip. Three rings, calm morning air. Learn her feel.',
    from: 'north',
    to: 'south',
    rings: 3,
    wind: 0.0,
    gusts: 0.0,
    fuel: 100,
    sunElevation: 38,
    fog: 0.35,
    timeLimit: 240,
  },
  {
    id: 2,
    name: 'Island Hop',
    brief: 'Five rings across the lagoon. Crosswind from the west — crab into it.',
    from: 'north',
    to: 'east',
    rings: 5,
    wind: 6.0,
    gusts: 1.5,
    fuel: 100,
    sunElevation: 52,
    fog: 0.25,
    timeLimit: 300,
  },
  {
    id: 3,
    name: 'Storm Courier',
    brief: 'Six rings at dusk, tight fuel, gusty air. The mail does not wait.',
    from: 'south',
    to: 'north',
    rings: 6,
    wind: 9.0,
    gusts: 3.5,
    fuel: 78,
    sunElevation: 12,
    fog: 0.55,
    timeLimit: 300,
  },
];

// Airstrips: flat ground, a heading, a position. The world builder flattens
// the terrain under each one and paints the runway on top.
export const STRIPS = {
  north: { x: -620, z: -620, heading: 0.65, length: 260, width: 26, name: 'North Field' },
  south: { x: 640, z: 660, heading: -2.4, length: 260, width: 26, name: 'South Strip' },
  east: { x: 700, z: -480, heading: 1.9, length: 240, width: 24, name: 'East Cay' },
};

export const KEYS = {
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  rollLeft: ['ArrowLeft', 'KeyA'],
  rollRight: ['ArrowRight', 'KeyD'],
  throttleUp: ['KeyW', 'ShiftLeft', 'ShiftRight', 'Equal'],
  throttleDown: ['KeyS', 'ControlLeft', 'ControlRight', 'Minus'],
  camera: ['KeyG'],
  pause: ['KeyP', 'Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  confirm: ['Enter', 'Space'],
};
