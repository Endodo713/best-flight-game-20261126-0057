// Sky Courier — the instruments.
// One job: the HUD. Altitude, speed and heading always in view, plus fuel,
// throttle, the horizon ball, the objective and the messages. All DOM and
// one small canvas, styled to look lit rather than drawn.

export function buildHud(root) {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div class="hud-corner hud-tl">
      <div class="hud-label">AIRSPEED</div>
      <div class="hud-big"><span id="hud-speed">0</span><span class="hud-unit"> kt</span></div>
      <div class="hud-bar"><div id="hud-speed-bar" class="hud-fill speed"></div></div>
      <div class="hud-label">ALTITUDE</div>
      <div class="hud-big"><span id="hud-alt">0</span><span class="hud-unit"> ft</span></div>
      <div class="hud-bar"><div id="hud-alt-bar" class="hud-fill alt"></div></div>
      <div class="hud-label">VERT SPEED</div>
      <div class="hud-small"><span id="hud-vs">0</span><span class="hud-unit"> ft/min</span></div>
    </div>
    <div class="hud-corner hud-tr">
      <div class="hud-label">HEADING</div>
      <div class="hud-big"><span id="hud-hdg">000</span>&deg;</div>
      <div id="hud-compass" class="hud-compass"><div id="hud-compass-strip"></div></div>
      <div class="hud-label">FUEL</div>
      <div class="hud-bar wide"><div id="hud-fuel-bar" class="hud-fill fuel"></div></div>
      <div class="hud-small"><span id="hud-fuel">100</span>% &middot; <span id="hud-damage">0</span>% damage</div>
      <div class="hud-label">THROTTLE</div>
      <div class="hud-bar wide"><div id="hud-thr-bar" class="hud-fill thr"></div></div>
    </div>
    <div class="hud-center">
      <canvas id="hud-horizon" width="150" height="150"></canvas>
      <div id="hud-stall" class="hud-warn hidden">STALL — NOSE DOWN, POWER UP</div>
    </div>
    <div class="hud-objective">
      <div id="hud-mission" class="hud-mission-name">First Light</div>
      <div id="hud-objective" class="hud-objective-text">Take off from North Field</div>
      <div id="hud-rings" class="hud-rings"></div>
      <div class="hud-small"><span id="hud-time">0:00</span> &middot; <span id="hud-score">0</span> pts</div>
    </div>
    <div id="hud-message" class="hud-message"></div>
    <div id="hud-toast" class="hud-toast hidden"></div>
  `;
  root.appendChild(hud);

  const compassStrip = hud.querySelector('#hud-compass-strip');
  const points = ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];
  compassStrip.innerHTML = points.map((p) => `<span>${p}</span>`).join('');

  return {
    el: hud,
    speed: hud.querySelector('#hud-speed'),
    speedBar: hud.querySelector('#hud-speed-bar'),
    alt: hud.querySelector('#hud-alt'),
    altBar: hud.querySelector('#hud-alt-bar'),
    vs: hud.querySelector('#hud-vs'),
    hdg: hud.querySelector('#hud-hdg'),
    compass: hud.querySelector('#hud-compass-strip'),
    fuelBar: hud.querySelector('#hud-fuel-bar'),
    fuel: hud.querySelector('#hud-fuel'),
    damage: hud.querySelector('#hud-damage'),
    thrBar: hud.querySelector('#hud-thr-bar'),
    horizon: hud.querySelector('#hud-horizon'),
    stall: hud.querySelector('#hud-stall'),
    mission: hud.querySelector('#hud-mission'),
    objective: hud.querySelector('#hud-objective'),
    rings: hud.querySelector('#hud-rings'),
    time: hud.querySelector('#hud-time'),
    score: hud.querySelector('#hud-score'),
    message: hud.querySelector('#hud-message'),
    toast: hud.querySelector('#hud-toast'),
  };
}

// The artificial horizon: a ball that rolls with the bank and slides with
// the pitch, drawn on its own little canvas.
export function drawHorizon(canvas, pitch, bank) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 68;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-bank);
  const pitchPx = THREE_PITCH_SCALE * pitch;
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3f7ec2';
  ctx.fillRect(-r - 10, -r - 10, (r + 10) * 2, r + 10);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-r - 10, 0, (r + 10) * 2, r + 10);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.restore();
  // Fixed lubber line and the little aeroplane mark.
  ctx.strokeStyle = '#ffb02e';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 26, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

const THREE_PITCH_SCALE = 130;

// Refresh every instrument from the flight state, once a frame.
export function updateHud(h, state, info) {
  const kt = Math.round(state.speed * 1.944);
  const ft = Math.round((state.position.y - 1.5) * 3.281);
  const vsFpm = Math.round(state.verticalSpeed * 196.85);
  const hdg = ((Math.round((state.heading * 180) / Math.PI) % 360) + 360) % 360;
  h.speed.textContent = kt;
  h.speedBar.style.width = `${Math.min(100, (kt / 150) * 100)}%`;
  h.alt.textContent = ft.toLocaleString('en-US');
  h.altBar.style.width = `${Math.min(100, (ft / 3000) * 100)}%`;
  h.vs.textContent = (vsFpm >= 0 ? '+' : '') + vsFpm.toLocaleString('en-US');
  h.hdg.textContent = String(hdg).padStart(3, '0');
  h.compass.style.transform = `translateX(${-((hdg / 360) * 480) % 480}px)`;
  h.fuelBar.style.width = `${state.fuel}%`;
  h.fuelBar.classList.toggle('low', state.fuel < 25);
  h.fuel.textContent = Math.round(state.fuel);
  h.damage.textContent = Math.round(state.damage);
  h.thrBar.style.width = `${Math.round(state.throttle * 100)}%`;
  h.stall.classList.toggle('hidden', !state.stalled);
  drawHorizon(h.horizon, state.pitch, state.bank);
  if (info) {
    h.mission.textContent = info.missionName;
    h.objective.textContent = info.objective;
    h.time.textContent = formatTime(info.timeLeft);
    h.score.textContent = info.score.toLocaleString('en-US');
    h.rings.innerHTML = info.rings
      .map((passed, i) => `<span class="hud-ring ${passed ? 'done' : i === info.nextRing ? 'next' : ''}">${i + 1}</span>`)
      .join('');
  }
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

let messageTimer = 0;
export function showMessage(h, text, ms = 2600) {
  h.message.textContent = text;
  h.message.classList.add('show');
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => h.message.classList.remove('show'), ms);
}

let toastTimer = 0;
export function showToast(h, text, ms = 1800) {
  h.toast.textContent = text;
  h.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => h.toast.classList.add('hidden'), ms);
}
