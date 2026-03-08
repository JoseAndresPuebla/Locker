/* ═══════════════════════════════════════════════
   CYCLONE – Arcade Timing Game
   Core game logic: Canvas rendering, timing,
   hit detection, progressive difficulty
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Constants ────────────────────────────────
  const TOTAL_COINS = 25;        // coins to collect to win
  const BASE_SPEED = 140;       // degrees per second (initial)
  const TRACK_SEGMENTS = 48;        // LED segments around ring
  const TRAIL_LENGTH = 6;         // arrow trail segments
  const COIN_MIN_OFFSET = 120;       // minimum degrees ahead for coin placement
  const COIN_MAX_OFFSET = 240;       // maximum degrees ahead for coin placement

  // ── Difficulty presets ───────────────────────
  // hitZone: ±degrees tolerance | speedInc: multiplier added per hit
  const DIFFICULTIES = {
    facil:   { hitZone: 30,   speedInc: 0.05, label: 'FÁCIL'  },
    normal:  { hitZone: 22,   speedInc: 0.05, label: 'NORMAL' },
    dificil: { hitZone: 15,   speedInc: 0.05, label: 'DIFÍCIL' },
    extremo: { hitZone: 15,   speedInc: 0.10, label: 'EXTREMO' },
  };
  let currentDifficulty = 'normal'; // selected by the player

  // ── Credit System ─────────────────────────
  // Each game costs 10cr. Each coin collected earns 1cr.
  // Win = 25cr earned → net +15. Die at 10 coins = break-even.
  // Starting balance: 100cr (10 free games). Emergency top-up: +20cr.
  const CREDITS_PLAY_COST = 10;
  const CREDITS_PER_COIN  = 1;
  const CREDITS_BONUS     = 20;   // auto top-up when balance < play cost
  const CREDITS_KEY       = 'cyclone_credits';
  const CREDITS_START     = 100;

  function getCredits() {
    const v = sessionStorage.getItem(CREDITS_KEY);
    return v !== null ? parseInt(v, 10) : CREDITS_START;
  }
  function setCredits(n) {
    const val = Math.max(0, Math.round(n));
    sessionStorage.setItem(CREDITS_KEY, val);
    return val;
  }
  function addCredits(n)   { return setCredits(getCredits() + n); }
  function spendCredits(n) { return setCredits(getCredits() - n); }

  // ── State ─────────────────────────────────────
  const state = {
    screen: 'start', // 'start' | 'game' | 'gameover' | 'win'
    arrowAngle: -90,     // raw cumulative angle (unbounded, not normalized)
    coinAngle: 0,       // coin position in 0-360°
    speed: BASE_SPEED,
    speedMult: 1.0,
    direction: 1,       // +1 = clockwise, -1 = counterclockwise
    coinOffset: 180,     // how many degrees ahead the coin was placed
    arrowAngleAtCoin: -90,     // raw arrowAngle at the moment the coin was placed
    hitsLeft: TOTAL_COINS,
    hitsScored: 0,
    running: false,
    rafId: null,
    lastTime: null,
    inputLocked: false,
  };

  // ── DOM refs ──────────────────────────────────
  const screens = {
    start: document.getElementById('screen-start'),
    game: document.getElementById('screen-game'),
    gameover: document.getElementById('screen-gameover'),
    win: document.getElementById('screen-win'),
  };
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const counterEl = document.getElementById('counter-to-go');
  const hudSpeed = document.getElementById('hud-speed');
  const hudHits = document.getElementById('hud-hits');
  const hitFeedback = document.getElementById('hit-feedback');
  const btnStart = document.getElementById('btn-start');
  const btnAction = document.getElementById('btn-action');
  const btnRetry = document.getElementById('btn-retry');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const goHits = document.getElementById('go-hits');
  const goSpeed = document.getElementById('go-speed');
  const winParticles = document.getElementById('win-particles');

  // HUD badge that shows the current difficulty during gameplay
  const hudDiffBadge = (() => {
    const el = document.createElement('div');
    el.id = 'hud-diff-badge';
    el.className = 'hud-difficulty';
    el.style.display = 'none';
    document.getElementById('screen-game').appendChild(el);
    return el;
  })();

  // ── Difficulty selector UI ───────────────────
  // All .diff-btn elements across ALL screens are handled here.
  // Clicking any button syncs the active state across all groups
  // by data-difficulty attribute, so result-screen selectors stay in sync.
  const diffBtns = document.querySelectorAll('.diff-btn');
  diffBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentDifficulty = btn.dataset.difficulty;
      diffBtns.forEach(b => {
        const isSelected = b.dataset.difficulty === currentDifficulty;
        b.classList.toggle('active', isSelected);
        b.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });
    });
  });

  // Initialise credits display on load
  updateCreditsDisplay();

  // ── Canvas dimensions (logical) ──────────────
  const W = 420, H = 420;
  const CX = W / 2, CY = H / 2;
  const OUTER_R = 190;
  const TRACK_R = 162;
  const INNER_R = 130;
  const COIN_R = 17;
  const ARROW_R = 150;
  const ARROW_LEN = 28;

  // ── Sound Engine (Web Audio API) ─────────────────
  // All sounds are synthesized – no external files required.
  const audioCtx = (() => {
    try { return new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  })();

  function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  // Hit sound: pitch scales up as the player progresses.
  // hitsScored goes 1–25; frequency sweeps from ~330 Hz (E4) to ~830 Hz (G#5).
  function playHitSound(hitsScored) {
    if (!audioCtx) return;
    resumeAudio();
    const t = audioCtx.currentTime;

    // Pitch ramp: base note rises with each hit
    const baseFreq = 330 * Math.pow(2, (hitsScored - 1) / 12); // semitone per hit
    const peakFreq = baseFreq * 1.6;

    // Volume also nudges up slightly as tension builds
    const vol = Math.min(0.25 + hitsScored * 0.008, 0.5);

    // Main coin "ding" oscillator
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, t);
    osc1.frequency.exponentialRampToValueAtTime(peakFreq, t + 0.08);
    osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, t + 0.22);
    gain1.gain.setValueAtTime(vol, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc1.connect(gain1); gain1.connect(audioCtx.destination);
    osc1.start(t); osc1.stop(t + 0.25);

    // High shimmer overtone
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(peakFreq * 2, t);
    gain2.gain.setValueAtTime(vol * 0.4, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc2.connect(gain2); gain2.connect(audioCtx.destination);
    osc2.start(t); osc2.stop(t + 0.12);
  }

  // Miss sound: descending buzz – feels punishing.
  function playMissSound() {
    if (!audioCtx) return;
    resumeAudio();
    const t = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.45);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.45);

    // Low thud underneath
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(80, t);
    osc2.frequency.exponentialRampToValueAtTime(30, t + 0.2);
    gain2.gain.setValueAtTime(0.3, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc2.connect(gain2); gain2.connect(audioCtx.destination);
    osc2.start(t); osc2.stop(t + 0.2);
  }

  // Win fanfare: triumphant ascending arpeggio then held chord.
  function playWinSound() {
    if (!audioCtx) return;
    resumeAudio();
    const t = audioCtx.currentTime;

    // Arpeggio notes: C5, E5, G5, C6
    const arpNotes = [523, 659, 784, 1047];
    arpNotes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      const nt = t + i * 0.13;
      osc.frequency.setValueAtTime(freq, nt);
      osc.frequency.linearRampToValueAtTime(freq * 1.01, nt + 0.15); // slight vibrato
      gain.gain.setValueAtTime(0, nt);
      gain.gain.linearRampToValueAtTime(0.35, nt + 0.06);
      gain.gain.setValueAtTime(0.35, nt + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, nt + 0.7);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(nt); osc.stop(nt + 0.7);
    });

    // Final held chord swell at t+0.55
    const chordNotes = [523, 659, 784];
    chordNotes.forEach(freq => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      const nt = t + 0.55;
      osc.frequency.setValueAtTime(freq, nt);
      gain.gain.setValueAtTime(0, nt);
      gain.gain.linearRampToValueAtTime(0.2, nt + 0.15);
      gain.gain.setValueAtTime(0.2, nt + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, nt + 1.2);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(nt); osc.stop(nt + 1.2);
    });
  }

  // ── Utilities ─────────────────────────────────
  const toRad = deg => (deg * Math.PI) / 180;

  function polarToXY(angle, r) {
    const rad = toRad(angle);
    return { x: CX + Math.cos(rad) * r, y: CY + Math.sin(rad) * r };
  }

  function shortestAngleDiff(a, b) {
    let diff = ((b - a) % 360 + 360) % 360;
    if (diff > 180) diff -= 360;
    return diff;
  }

  function normalizeAngle(deg) {
    return ((deg % 360) + 360) % 360;
  }

  // ── Screen management ─────────────────────────
  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    state.screen = name;
  }

  // ── Place a new coin ──────────────────────────
  // Stores the offset and the arrow's raw angle at placement so pass-detection
  // can use monotone cumulative travel (no wrap-around discontinuities).
  function placeCoin() {
    const range = COIN_MAX_OFFSET - COIN_MIN_OFFSET;
    state.coinOffset = COIN_MIN_OFFSET + Math.floor(Math.random() * range);
    state.arrowAngleAtCoin = state.arrowAngle; // raw – may be far outside 0-360
    const currentNorm = normalizeAngle(state.arrowAngle);
    state.coinAngle = normalizeAngle(currentNorm + state.coinOffset * state.direction);
  }

  // ── Game init ─────────────────────────────────
  function startGame() {
    // ─ Credit check: give emergency top-up if broke ─
    if (getCredits() < CREDITS_PLAY_COST) {
      addCredits(CREDITS_BONUS);
    }
    spendCredits(CREDITS_PLAY_COST);

    state.arrowAngle = -90;
    state.direction = 1;
    state.speed = BASE_SPEED;
    state.speedMult = 1.0;
    state.hitsLeft = TOTAL_COINS;
    state.hitsScored = 0;
    state.running = true;
    state.lastTime = null;
    state.inputLocked = false;
    placeCoin();
    updateHUD();
    updateCreditsDisplay();
    // Show difficulty badge in HUD
    const diff = DIFFICULTIES[currentDifficulty];
    hudDiffBadge.textContent = diff.label;
    hudDiffBadge.className = 'hud-difficulty ' + currentDifficulty;
    hudDiffBadge.style.display = 'block';
    showScreen('game');
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function stopGame() {
    state.running = false;
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
  }

  // ── Main game loop ────────────────────────────
  function gameLoop(timestamp) {
    if (!state.running) return;

    if (!state.lastTime) state.lastTime = timestamp;
    const dt = Math.min((timestamp - state.lastTime) / 1000, 0.05);
    state.lastTime = timestamp;

    // Advance arrow
    state.arrowAngle += state.speed * state.direction * dt;

    const normArrow = normalizeAngle(state.arrowAngle);
    const normCoin = normalizeAngle(state.coinAngle);

    if (!state.inputLocked) {
      // How many degrees has the arrow traveled in the travel direction
      // since the coin was placed? (raw subtraction, no normalization needed)
      const traveled = (state.arrowAngle - state.arrowAngleAtCoin) * state.direction;

      // The coin sits at exactly `coinOffset` degrees of travel.
      // If traveled > coinOffset + HIT_ZONE, the player missed it.
      if (traveled > state.coinOffset + DIFFICULTIES[currentDifficulty].hitZone) {
        handleMiss('passed');
        return;
      }
    }

    render(normArrow, normCoin);
    state.rafId = requestAnimationFrame(gameLoop);
  }

  // ── Rendering ─────────────────────────────────
  function render(arrowAngle, coinAngle) {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawOuterRing();
    drawTrackSegments(arrowAngle);
    drawCoin(coinAngle);
    drawArrow(arrowAngle);
    drawCenterDisplay();
  }

  function drawBackground() {
    const grad = ctx.createRadialGradient(CX, CY, 0, CX, CY, OUTER_R);
    grad.addColorStop(0, 'rgba(8,15,30,0.95)');
    grad.addColorStop(0.7, 'rgba(4,8,15,0.98)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOuterRing() {
    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    const ringGrad = ctx.createLinearGradient(CX - OUTER_R, CY, CX + OUTER_R, CY);
    ringGrad.addColorStop(0, '#1A3A5C');
    ringGrad.addColorStop(0.5, '#2A6090');
    ringGrad.addColorStop(1, '#1A3A5C');
    ctx.strokeStyle = ringGrad;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(CX, CY, OUTER_R, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,207,255,0.25)';
    ctx.stroke();
  }

  function drawTrackSegments(arrowAngle) {
    const SEG_ARC = (360 / TRACK_SEGMENTS) * 0.7;

    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      const segStart = toRad(i * (360 / TRACK_SEGMENTS) - 90);
      const segEnd = toRad(i * (360 / TRACK_SEGMENTS) - 90 + SEG_ARC);
      const segMid = (i * (360 / TRACK_SEGMENTS) + SEG_ARC / 2) - 90;

      const distFromArrow = Math.abs(shortestAngleDiff(arrowAngle, segMid));
      const proximity = Math.max(0, 1 - distFromArrow / 60);

      let alpha = 0.25 + proximity * 0.5;
      let g = 140 + proximity * 67, b = 200 + proximity * 55;

      ctx.beginPath();
      ctx.arc(CX, CY, TRACK_R, segStart, segEnd);
      ctx.lineWidth = 12;
      ctx.strokeStyle = `rgba(0,${g},${b},${alpha})`;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(CX, CY, TRACK_R - 8, segStart, segEnd);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(0,207,255,${alpha * 0.5})`;
      ctx.stroke();
    }
  }

  function drawCoin(coinAngle) {
    const pos = polarToXY(coinAngle - 90, TRACK_R);

    // Subtle inner glow – tight radius so it reads as coin shine, not an activation zone
    const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, COIN_R * 1.6);
    glow.addColorStop(0, 'rgba(255,215,0,0.45)');
    glow.addColorStop(0.6, 'rgba(255,180,0,0.15)');
    glow.addColorStop(1, 'rgba(255,180,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, COIN_R * 1.6, 0, Math.PI * 2);
    ctx.fill();

    const coinGrad = ctx.createRadialGradient(pos.x - 3, pos.y - 3, 1, pos.x, pos.y, COIN_R);
    coinGrad.addColorStop(0, '#FFEE80');
    coinGrad.addColorStop(0.5, '#FFD700');
    coinGrad.addColorStop(1, '#B8860B');
    ctx.fillStyle = coinGrad;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, COIN_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#DAA520';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(100,60,0,0.8)';
    ctx.font = 'bold 11px Orbitron, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', pos.x, pos.y + 0.5);
  }

  function drawArrow(arrowAngle) {
    // Trail: goes in the OPPOSITE direction of travel
    for (let t = 1; t <= TRAIL_LENGTH; t++) {
      const trailAngle = arrowAngle - state.direction * t * (state.speed / 60) * 2;
      const tp = polarToXY(trailAngle - 90, ARROW_R);
      const alpha = (1 - t / TRAIL_LENGTH) * 0.3;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, 5 - t * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0,207,255,${alpha})`;
      ctx.fill();
    }

    const headPos = polarToXY(arrowAngle - 90, ARROW_R);

    const arrowGlow = ctx.createRadialGradient(headPos.x, headPos.y, 0, headPos.x, headPos.y, 22);
    arrowGlow.addColorStop(0, 'rgba(0,207,255,0.6)');
    arrowGlow.addColorStop(0.5, 'rgba(0,207,255,0.2)');
    arrowGlow.addColorStop(1, 'rgba(0,207,255,0)');
    ctx.fillStyle = arrowGlow;
    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, 22, 0, Math.PI * 2);
    ctx.fill();

    const tailPos = polarToXY(arrowAngle - 90, ARROW_R - ARROW_LEN);
    ctx.beginPath();
    ctx.moveTo(tailPos.x, tailPos.y);
    ctx.lineTo(headPos.x, headPos.y);
    ctx.strokeStyle = '#00CFFF';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#00CFFF';
    ctx.shadowBlur = 15;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(headPos.x, headPos.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#00FFEE';
    ctx.shadowColor = '#00CFFF';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;

    drawArrowWings(arrowAngle, headPos);
  }

  function drawArrowWings(angle, headPos) {
    const perpRad = toRad(angle);
    const wx = Math.cos(perpRad) * 8;
    const wy = Math.sin(perpRad) * 8;
    const backX = Math.cos(toRad(angle - 90 + 180)) * 10;
    const backY = Math.sin(toRad(angle - 90 + 180)) * 10;

    ctx.beginPath();
    ctx.moveTo(headPos.x, headPos.y);
    ctx.lineTo(headPos.x + backX + wx, headPos.y + backY + wy);
    ctx.moveTo(headPos.x, headPos.y);
    ctx.lineTo(headPos.x + backX - wx, headPos.y + backY - wy);
    ctx.strokeStyle = 'rgba(0,207,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  function drawCenterDisplay() {
    const innerGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, INNER_R);
    innerGrad.addColorStop(0, '#0C1A2E');
    innerGrad.addColorStop(0.8, '#060D1A');
    innerGrad.addColorStop(1, '#040810');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(CX, CY, INNER_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(CX, CY, INNER_R, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,207,255,0.2)';
    ctx.stroke();

    for (let i = 0; i < 16; i++) {
      const pos = polarToXY(i * (360 / 16) - 90, INNER_R - 12);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,207,255,0.3)';
      ctx.fill();
    }
  }

  // ── Hit / Miss handling ────────────────────────
  function handleHit() {
    if (state.inputLocked) return;
    state.inputLocked = true;

    state.hitsScored++;
    state.hitsLeft--;
    state.speed *= (1 + DIFFICULTIES[currentDifficulty].speedInc);
    state.speedMult = state.speed / BASE_SPEED;

    // Earn one credit per coin collected
    addCredits(CREDITS_PER_COIN);

    // Reverse direction on every successful hit (like the real arcade)
    state.direction *= -1;

    playHitSound(state.hitsScored); // pitch rises with each coin collected
    triggerFeedback('hit');
    bumpCounter();
    updateHUD();

    if (state.hitsLeft <= 0) {
      stopGame();
      setTimeout(showWin, 600);
      return;
    }

    // Place next coin ahead in the NEW direction
    placeCoin();

    setTimeout(() => { state.inputLocked = false; }, 250);
  }

  function handleMiss() {
    if (state.inputLocked) return;
    state.inputLocked = true;
    stopGame();
    playMissSound();
    triggerFeedback('miss');
    shakeCanvas();
    setTimeout(() => showGameOver(), 700);
  }

  function triggerFeedback(type) {
    hitFeedback.className = 'hit-feedback ' + type;
    void hitFeedback.offsetWidth;
    hitFeedback.className = 'hit-feedback ' + type;
  }

  function shakeCanvas() {
    canvas.style.animation = 'none';
    void canvas.offsetWidth;
    canvas.style.animation = 'shake 0.35s ease-out';
    setTimeout(() => { canvas.style.animation = ''; }, 350);
  }

  function bumpCounter() {
    counterEl.classList.remove('bump');
    void counterEl.offsetWidth;
    counterEl.classList.add('bump');
    setTimeout(() => counterEl.classList.remove('bump'), 300);
  }

  function updateHUD() {
    counterEl.textContent = state.hitsLeft;
    hudSpeed.textContent = state.speedMult.toFixed(1) + 'x';
    hudHits.textContent = state.hitsScored;
    // Update in-game credits display
    const credVal = document.getElementById('hud-credits-val');
    if (credVal) credVal.textContent = getCredits();
  }

  function updateCreditsDisplay() {
    const c = getCredits();
    // Start screen strip
    const strip = document.getElementById('start-credits-strip');
    const stripVal = document.getElementById('start-credits-val');
    if (stripVal) stripVal.textContent = c;
    if (strip) strip.classList.toggle('low', c < CREDITS_PLAY_COST * 2);
    // In-game HUD
    const hudVal = document.getElementById('hud-credits-val');
    if (hudVal) hudVal.textContent = c;
  }

  // ── End screens ───────────────────────────────
  function showGameOver() {
    goHits.textContent = state.hitsScored;
    goSpeed.textContent = state.speedMult.toFixed(1) + 'x';
    // Credits summary
    const earned = state.hitsScored * CREDITS_PER_COIN;
    document.getElementById('go-credits-earned').textContent = earned;
    document.getElementById('go-credits-balance').textContent = getCredits();
    updateCreditsDisplay();
    showScreen('gameover');
  }

  function showWin() {
    // Credits summary (all 25 coins already credited in handleHit)
    const earned = TOTAL_COINS * CREDITS_PER_COIN;
    document.getElementById('win-credits-earned').textContent = earned;
    document.getElementById('win-credits-balance').textContent = getCredits();
    updateCreditsDisplay();
    playWinSound();
    spawnParticles();
    showScreen('win');
  }

  function spawnParticles() {
    winParticles.innerHTML = '';
    const colors = ['#FFD700', '#00CFFF', '#FF3A5C', '#39FF14', '#FF8C00', '#FFFFFF'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = Math.random() * 10 + 5;
      p.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${Math.random() * 100}%;
        top: ${-size}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        animation-duration: ${1.5 + Math.random() * 2}s;
        animation-delay: ${Math.random() * 1}s;
        opacity: ${0.7 + Math.random() * 0.3};
      `;
      winParticles.appendChild(p);
    }
  }

  // ── Input handling ────────────────────────────
  function onPlayerInput() {
    if (state.screen !== 'game' || !state.running || state.inputLocked) return;

    const normArrow = normalizeAngle(state.arrowAngle);
    const normCoin = normalizeAngle(state.coinAngle);
    const diff = Math.abs(shortestAngleDiff(normArrow, normCoin));

    if (diff <= DIFFICULTIES[currentDifficulty].hitZone) {
      handleHit();
    } else {
      handleMiss();
    }
  }

  // ── Event Listeners ───────────────────────────
  btnStart.addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
  btnRetry.addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
  btnPlayAgain.addEventListener('click', (e) => { e.stopPropagation(); startGame(); });

  btnAction.addEventListener('click', (e) => {
    e.stopPropagation();
    onPlayerInput();
  });
  btnAction.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onPlayerInput();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (state.screen === 'game') {
        onPlayerInput();
      } else if (state.screen === 'start' || state.screen === 'gameover' || state.screen === 'win') {
        startGame();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (state.screen === 'game' && e.target !== btnAction) {
      onPlayerInput();
    }
  });

  // ── Idle animation on start screen ───────────
  (function idleRender() {
    let angle = -90;
    let idleRafId = null;
    let lastT = null;
    const coinIdle = 45;

    function idleLoop(t) {
      if (state.screen !== 'start') return;
      if (!lastT) lastT = t;
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;
      angle += 80 * dt;
      render(normalizeAngle(angle), normalizeAngle(coinIdle));
      idleRafId = requestAnimationFrame(idleLoop);
    }
    idleRafId = requestAnimationFrame(idleLoop);

    function stopIdle() { if (idleRafId) cancelAnimationFrame(idleRafId); }
    btnStart.addEventListener('click', stopIdle);
    btnRetry.addEventListener('click', stopIdle);
    btnPlayAgain.addEventListener('click', stopIdle);
  })();

})();
