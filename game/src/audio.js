// Sky Courier — sound, synthesised.
// One job: every sound the game makes, built from oscillators and noise in
// WebAudio. No audio files, no network, nothing to ship.

export function makeAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Engine: two detuned saws through a low-pass, the way a radial sounds
    // when it is working — a drone that rises with the throttle.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.5;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();

    // Wind: looped noise through a band-pass that opens with airspeed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
    return ctx;
  }

  function resume() {
    if (!ctx) ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  // Called every frame: the engine follows the throttle, the wind the speed.
  function update(throttle, speed, onGround) {
    if (!ctx || muted || !started) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(0.045 + throttle * 0.075, t, 0.1);
    engineOsc.frequency.setTargetAtTime(48 + throttle * 55, t, 0.1);
    const windLevel = onGround ? 0 : Math.min(0.16, (speed / 78) * 0.16);
    windGain.gain.setTargetAtTime(windLevel, t, 0.2);
    windFilter.frequency.setTargetAtTime(350 + speed * 12, t, 0.2);
  }

  function setMuted(m) {
    muted = m;
    if (ctx) {
      const t = ctx.currentTime;
      if (engineGain) engineGain.gain.setTargetAtTime(m ? 0 : 0.05, t, 0.05);
      if (windGain) windGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  return { ensure, resume, update, setMuted, get muted() { return muted; } };
}

// One-shot sounds: a bell for a ring, a thud for a touchdown, a little
// fanfare for a finished sortie. Each is a few oscillators, scheduled and
// forgotten.
export function makeOneShots(audio) {
  function tone(freq, at, dur, type = 'sine', vol = 0.16) {
    const ctx = audio.ensure();
    if (!ctx || audio.muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + at);
    g.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime + at);
    o.stop(ctx.currentTime + at + dur + 0.05);
  }

  return {
    ring() {
      tone(880, 0, 0.5);
      tone(1318, 0.07, 0.55);
    },
    thud() {
      tone(90, 0, 0.25, 'triangle', 0.3);
      tone(60, 0.03, 0.3, 'sine', 0.28);
    },
    takeoff() {
      tone(523, 0, 0.25);
      tone(659, 0.12, 0.3);
    },
    success() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.14, 0.5));
    },
    fail() {
      tone(330, 0, 0.4, 'triangle', 0.2);
      tone(247, 0.25, 0.7, 'triangle', 0.2);
    },
    stall() {
      tone(220, 0, 0.18, 'square', 0.08);
      tone(220, 0.25, 0.18, 'square', 0.08);
    },
    click() {
      tone(1200, 0, 0.06, 'sine', 0.08);
    },
  };
}
