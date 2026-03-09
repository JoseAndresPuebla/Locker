/* ═══════════════════════════════════════════════
   CYCLONE – Arcade Timing Game
   v3: Skins + Endless Mode + Credits
   ═══════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCpgy8GBR8JYf_IM0K8jlOrAuIm6DZxa6w",
  authDomain: "cyclone-arcade.firebaseapp.com",
  projectId: "cyclone-arcade",
  storageBucket: "cyclone-arcade.firebasestorage.app",
  messagingSenderId: "398592990567",
  appId: "1:398592990567:web:48f7660bd148b75fe963c2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Constants ────────────────────────────────────────────────────────────
const TOTAL_COINS     = 25;
const BASE_SPEED      = 140;
const TRACK_SEGMENTS  = 48;
const TRAIL_LENGTH    = 6;
const COIN_MIN_OFFSET = 120;
const COIN_MAX_OFFSET = 240;

const DIFFICULTIES = {
  facil:   { hitZone: 30,  speedInc: 0.05, label: 'FÁCIL'   },
  normal:  { hitZone: 22,  speedInc: 0.05, label: 'NORMAL'  },
  dificil: { hitZone: 15,  speedInc: 0.05, label: 'DIFÍCIL' },
  extremo: { hitZone: 15,  speedInc: 0.10, label: 'EXTREMO' },
};
let currentDifficulty = 'normal';
let endlessMode = false;

// ── Cloud State ───────────────────────────────────────────────────────────
let currentUser = null;
let userData = {
  credits: 100,
  owned: ['cyclone'],
  beaten: [],
  hs: {},
  stats: { gamesPlayed: 0, wins: 0, totalCoins: 0 },
  quests: [], // array of { id, title, type, target, progress, reward, claimed }
  addons: [],
  activeAddons: []
};

// ── Quests Templates ──────────────────────────────────────────────────────
const QUESTS_POOL = [
  { id: 'q_play', title: 'Juega 5 partidas', type: 'play', target: 5, reward: 20 },
  { id: 'q_win', title: 'Gana 1 partida', type: 'win', target: 1, reward: 50 },
  { id: 'q_coins', title: 'Recoge 50 monedas totales', type: 'coins', target: 50, reward: 30 }
];

function checkAndInitQuests() {
  if (userData.quests.length === 0) {
    userData.quests = QUESTS_POOL.map(q => ({ ...q, progress: 0, claimed: false }));
    saveDataToCloud();
  }
}

function addQuestProgress(type, amount = 1) {
  if (!userData.quests) return;
  let updated = false;
  userData.quests.forEach(q => {
    if (q.type === type && q.progress < q.target) {
      q.progress = Math.min(q.target, q.progress + amount);
      updated = true;
    }
  });
  if (updated) saveDataToCloud();
}

async function saveDataToCloud() {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid), userData);
  } catch(e) { console.error("Error saving data:", e); }
}

// ── Credit System ─────────────────────────────────────────────────────────
const CPC = 10, CPcoin = 1, CBONUS = 20;
const getCredits  = () => userData.credits;
const setCredits  = n  => { userData.credits = Math.max(0, Math.round(n)); saveDataToCloud(); return userData.credits; };
const addCredits  = n  => setCredits(getCredits() + n);
const spendCredits= n  => setCredits(getCredits() - n);

// ── Skin System ───────────────────────────────────────────────────────────
const SKIN_KEY  = 'cy_skin';

  const SKINS = {
    cyclone: {
      name: 'CYCLONE', sub: 'ORIGINAL', cost: 0, cls: '',
      canvas: {
        track: [0, 207, 255], arrow: '#00CFFF', arrowGlow: 'rgba(0,207,255,',
        arrowHead: '#00FFEE', arrowWings: 'rgba(0,207,255,0.7)',
        coinFill: '#FFD700', coinDark: '#B8860B', coinLight: '#FFEE80',
        coinGlow: 'rgba(255,215,0,', coinText: 'rgba(100,60,0,0.8)',
        bg1: 'rgba(8,15,30,0.95)', bg2: 'rgba(4,8,15,0.98)',
        cIn: '#0C1A2E', cMid: '#060D1A', cOut: '#040810',
        cGlow: 'rgba(0,207,255,0.2)', cDots: 'rgba(0,207,255,0.3)',
        rA: '#1A3A5C', rB: '#2A6090', rGlow: 'rgba(0,207,255,0.25)',
      }
    },
    inferno: {
      name: 'INFERNO', sub: '🔥 FIRE THEME', cost: 50, cls: 'skin-inferno',
      canvas: {
        track: [255, 80, 0], arrow: '#FF4500', arrowGlow: 'rgba(255,80,0,',
        arrowHead: '#FF8000', arrowWings: 'rgba(255,80,0,0.7)',
        coinFill: '#FFB800', coinDark: '#7A4000', coinLight: '#FFE066',
        coinGlow: 'rgba(255,185,0,', coinText: 'rgba(80,30,0,0.9)',
        bg1: 'rgba(25,3,0,0.95)', bg2: 'rgba(12,1,0,0.98)',
        cIn: '#1A0400', cMid: '#0F0200', cOut: '#080100',
        cGlow: 'rgba(255,80,0,0.2)', cDots: 'rgba(255,80,0,0.3)',
        rA: '#5C1A00', rB: '#903A00', rGlow: 'rgba(255,80,0,0.25)',
      }
    },
    matrix: {
      name: 'MATRIX', sub: '💚 HACK THE GAME', cost: 50, cls: 'skin-matrix',
      canvas: {
        track: [0, 255, 65], arrow: '#00FF41', arrowGlow: 'rgba(0,255,65,',
        arrowHead: '#80FF99', arrowWings: 'rgba(0,255,65,0.7)',
        coinFill: '#00FF41', coinDark: '#004D14', coinLight: '#80FF99',
        coinGlow: 'rgba(0,255,65,', coinText: 'rgba(0,50,10,0.9)',
        bg1: 'rgba(0,10,0,0.95)', bg2: 'rgba(0,5,0,0.98)',
        cIn: '#000D00', cMid: '#000800', cOut: '#000400',
        cGlow: 'rgba(0,255,65,0.2)', cDots: 'rgba(0,255,65,0.3)',
        rA: '#003A00', rB: '#006000', rGlow: 'rgba(0,255,65,0.25)',
      }
    },
    synthwave: {
      name: 'SYNTHWAVE', sub: '🌆 RETRO FUTURE', cost: 75, cls: 'skin-synthwave',
      canvas: {
        track: [255, 0, 190], arrow: '#FF00BE', arrowGlow: 'rgba(255,0,190,',
        arrowHead: '#FF80DF', arrowWings: 'rgba(255,0,190,0.7)',
        coinFill: '#FFBE0B', coinDark: '#7B4F00', coinLight: '#FFD966',
        coinGlow: 'rgba(255,190,11,', coinText: 'rgba(60,20,0,0.9)',
        bg1: 'rgba(18,0,30,0.95)', bg2: 'rgba(8,0,16,0.98)', bg3: 'rgba(0,0,0,1)',
        cIn: '#160024', cMid: '#0D0018', cOut: '#08000F',
        cGlow: 'rgba(255,0,190,0.2)', cDots: 'rgba(255,0,190,0.3)',
        rA: '#3A005C', rB: '#600090', rGlow: 'rgba(255,0,190,0.25)',
      }
    },
    botanic: {
      name: 'BOTANIC', sub: '🌿 ZEN GARDEN', cost: 100, cls: 'skin-botanic',
      canvas: {
        track: [139, 195, 74], arrow: '#8BC34A', arrowGlow: 'rgba(139,195,74,',
        arrowHead: '#CCFF90', arrowWings: 'rgba(139,195,74,0.7)',
        coinFill: '#FFCA28', coinDark: '#FF8F00', coinLight: '#FFE082',
        coinGlow: 'rgba(255,202,40,', coinText: 'rgba(60,40,0,0.9)',
        bg1: 'rgba(42,66,45,0.95)', bg2: 'rgba(28,46,31,0.98)', bg3: 'rgba(10,20,10,1)',
        cIn: '#355239', cMid: '#2A422D', cOut: '#1C2E1F',
        cGlow: 'rgba(139,195,74,0.2)', cDots: 'rgba(139,195,74,0.4)',
        rA: '#4E342E', rB: '#6D4C41', rGlow: 'rgba(139,195,74,0.25)', // Wood color ring
      }
    },
    candy: {
      name: 'SUGAR RUSH', sub: '🍬 PASTEL DREAM', cost: 100, cls: 'skin-candy',
      canvas: {
        track: [255, 64, 129], arrow: '#FF4081', arrowGlow: 'rgba(255,64,129,',
        arrowHead: '#FFFFFF', arrowWings: 'rgba(0,229,255,0.8)',
        coinFill: '#FFEA00', coinDark: '#F57F17', coinLight: '#FFFF8D',
        coinGlow: 'rgba(255,234,0,', coinText: 'rgba(194,24,91,0.9)',
        bg1: 'rgba(252,228,236,1)', bg2: 'rgba(248,187,208,1)', bg3: 'rgba(244,143,177,1)',
        cIn: '#FFFFFF', cMid: '#FCE4EC', cOut: '#F8BBD0',
        cGlow: 'rgba(255,64,129,0.3)', cDots: 'rgba(255,64,129,0.5)',
        rA: '#00E5FF', rB: '#FF4081', rGlow: 'rgba(255,255,255,0.6)',
      }
    },
    crt: {
      name: 'CRT OVERDRIVE', sub: '📺 VHS GLITCH', cost: 500, cls: 'skin-crt',
      canvas: {
        track: [0, 255, 170], arrow: '#00FFAA', arrowGlow: 'rgba(0,255,170,',
        arrowHead: '#FFFFFF', arrowWings: 'rgba(0,255,170,0.8)',
        coinFill: '#FF0055', coinDark: '#880022', coinLight: '#FFAABB',
        coinGlow: 'rgba(255,0,85,', coinText: 'rgba(255,255,255,0.9)',
        bg1: 'rgba(2,10,5,0.95)', bg2: 'rgba(1,5,2,0.98)', bg3: 'rgba(0,0,0,1)',
        cIn: '#002211', cMid: '#001108', cOut: '#000804',
        cGlow: 'rgba(0,255,170,0.3)', cDots: 'rgba(0,255,170,0.5)',
        rA: '#005533', rB: '#00aa66', rGlow: 'rgba(0,255,170,0.5)',
      }
    },
    cartoon: {
      name: 'COMIC POP', sub: '💬 CARTOON STYLE', cost: 0, cls: 'skin-cartoon',
      canvas: {
        track: [0, 0, 0], arrow: '#0055FF', arrowGlow: 'rgba(0,0,0,-1',
        arrowHead: '#FFD500', arrowWings: 'transparent',
        coinFill: '#FFD500', coinDark: '#FF9900', coinLight: '#FFFF66',
        coinGlow: 'rgba(0,0,0,-1', coinText: '#000000',
        bg1: 'rgba(255,251,204,1)', bg2: 'rgba(255,245,153,1)', bg3: 'rgba(255,251,204,1)',
        cIn: '#FFFFFF', cMid: '#FFFFFF', cOut: '#FFFFFF',
        cGlow: 'rgba(0,0,0,1)', cDots: '#000000',
        rA: '#000000', rB: '#000000', rGlow: 'rgba(0,0,0,0)',
      }
    },
  };

  const ADDONS = {
    zone_facil:   { name: 'ZONA FÁCIL', sub: '📐 GUÍA DE ACIERTO', cost: 50,  diff: 'facil', req: null },
    zone_normal:  { name: 'ZONA NORMAL', sub: '📐 GUÍA DE ACIERTO', cost: 150, diff: 'normal', req: 'facil' },
    zone_dificil: { name: 'ZONA DIFÍCIL', sub: '📐 GUÍA DE ACIERTO', cost: 300, diff: 'dificil', req: 'normal' },
    zone_extremo: { name: 'ZONA EXTREMO', sub: '📐 GUÍA DE ACIERTO', cost: 600, diff: 'extremo', req: 'dificil' },
  };

  let SK = SKINS.cyclone.canvas; // active skin colors

  const getActiveSkin = ()  => sessionStorage.getItem(SKIN_KEY) || 'cyclone';
  const getOwned      = ()  => userData.owned;
  const addOwned      = id  => { if (!userData.owned.includes(id)) { userData.owned.push(id); saveDataToCloud(); } };
  const isOwned       = id  => SKINS[id].cost === 0 || userData.owned.includes(id);

  function applySkin(id) {
    if (!SKINS[id]) id = 'cyclone';
    Object.values(SKINS).forEach(s => { if (s.cls) document.body.classList.remove(s.cls); });
    if (SKINS[id].cls) document.body.classList.add(SKINS[id].cls);
    SK = SKINS[id].canvas;
    sessionStorage.setItem(SKIN_KEY, id);
  }

  // ── Endless System ────────────────────────────────────────────────────────
  const getBeaten  = ()     => userData.beaten;
  const markBeaten = d      => { if (!userData.beaten.includes(d)) { userData.beaten.push(d); saveDataToCloud(); } };
  const isBeaten   = d      => userData.beaten.includes(d);
  const getHS      = d      => userData.hs[d] || 0;
  const updateHS   = (d, s) => { if (s > getHS(d)) { userData.hs[d] = s; saveDataToCloud(); } };

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    screen: 'start', arrowAngle: -90, coinAngle: 0,
    speed: BASE_SPEED, speedMult: 1.0, direction: 1,
    coinOffset: 180, arrowAngleAtCoin: -90,
    hitsLeft: TOTAL_COINS, hitsScored: 0,
    endless: false, running: false, rafId: null, lastTime: null, inputLocked: false,
  };

  // ── DOM Refs ──────────────────────────────────────────────────────────────
  const screens = {
    auth:     document.getElementById('screen-auth'),
    start:    document.getElementById('screen-start'),
    game:     document.getElementById('screen-game'),
    gameover: document.getElementById('screen-gameover'),
    win:      document.getElementById('screen-win'),
    shop:     document.getElementById('screen-shop'),
    profile:  document.getElementById('screen-profile'),
  };
  const canvas      = document.getElementById('game-canvas');
  const ctx         = canvas.getContext('2d');
  const counterEl   = document.getElementById('counter-to-go');
  const counterLbl  = document.getElementById('counter-label');
  const hudSpeed    = document.getElementById('hud-speed');
  const hudHits     = document.getElementById('hud-hits');
  const hitFeedback = document.getElementById('hit-feedback');
  const btnStart    = document.getElementById('btn-start');
  const btnAction   = document.getElementById('btn-action');
  const btnRetry    = document.getElementById('btn-retry');
  const btnPlayAgain= document.getElementById('btn-play-again');
  const goHits      = document.getElementById('go-hits');
  const goSpeed     = document.getElementById('go-speed');
  const winParticles= document.getElementById('win-particles');

  // HUD difficulty badge (injected into game screen)
  const hudDiffBadge = (() => {
    const el = document.createElement('div');
    el.id = 'hud-diff-badge'; el.className = 'hud-difficulty'; el.style.display = 'none';
    document.getElementById('screen-game').appendChild(el);
    return el;
  })();

  // ── Difficulty Selector (all screens synced) ──────────────────────────────
  const diffBtns = document.querySelectorAll('.diff-btn');

  function syncDiffBtns() {
    diffBtns.forEach(b => {
      const sel = b.dataset.difficulty === currentDifficulty;
      b.classList.toggle('active', sel);
      b.setAttribute('aria-pressed', sel ? 'true' : 'false');
      b.classList.toggle('diff-locked', endlessMode && !isBeaten(b.dataset.difficulty));
    });
  }

  diffBtns.forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    if (endlessMode && !isBeaten(btn.dataset.difficulty)) return;
    currentDifficulty = btn.dataset.difficulty;
    syncDiffBtns();
  }));

  // ── Endless Toggle UI ─────────────────────────────────────────────────────
  function updateEndlessUI() {
    const container = document.getElementById('endless-toggle-container');
    if (!container) return;
    const beaten = getBeaten();
    container.style.display = beaten.length > 0 ? 'flex' : 'none';
    const btn = document.getElementById('btn-endless-toggle');
    if (btn) {
      btn.textContent = endlessMode ? '∞ ENDLESS ON' : '∞ ENDLESS OFF';
      btn.classList.toggle('active', endlessMode);
    }
    const hint = container.querySelector('.endless-hint');
    if (hint) {
      const names = beaten.map(d => DIFFICULTIES[d].label).join(', ');
      hint.textContent = `Desbloqueado: ${names}`;
    }
    if (endlessMode && !isBeaten(currentDifficulty)) {
      currentDifficulty = beaten[0] || 'normal';
    }
    syncDiffBtns();
  }

  const btnET = document.getElementById('btn-endless-toggle');
  if (btnET) btnET.addEventListener('click', e => { e.stopPropagation(); endlessMode = !endlessMode; updateEndlessUI(); });

  // App setup now deferred to onAuthStateChanged

  // ── Canvas Dimensions ─────────────────────────────────────────────────────
  const W = 420, H = 420, CX = W / 2, CY = H / 2;
  const OUTER_R = 190, TRACK_R = 162, INNER_R = 130;
  const COIN_R = 17, ARROW_R = 150, ARROW_LEN = 28;

  // ── Sound Engine ──────────────────────────────────────────────────────────
  const audioCtx = (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; } })();
  function resumeAudio() { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }

  function playHitSound(n) {
    if (!audioCtx) return; resumeAudio();
    const t = audioCtx.currentTime, f = 330 * Math.pow(2, (n-1) / 12), p = f * 1.6, v = Math.min(0.25 + n * 0.008, 0.5);
    const o1 = audioCtx.createOscillator(), g1 = audioCtx.createGain();
    o1.type = 'sine'; o1.frequency.setValueAtTime(f, t); o1.frequency.exponentialRampToValueAtTime(p, t+.08); o1.frequency.exponentialRampToValueAtTime(f*.9, t+.22);
    g1.gain.setValueAtTime(v, t); g1.gain.exponentialRampToValueAtTime(.001, t+.25);
    o1.connect(g1); g1.connect(audioCtx.destination); o1.start(t); o1.stop(t+.25);
    const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
    o2.type = 'triangle'; o2.frequency.setValueAtTime(p*2, t);
    g2.gain.setValueAtTime(v*.4, t); g2.gain.exponentialRampToValueAtTime(.001, t+.12);
    o2.connect(g2); g2.connect(audioCtx.destination); o2.start(t); o2.stop(t+.12);
  }

  function playMissSound() {
    if (!audioCtx) return; resumeAudio();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(55, t+.45);
    g.gain.setValueAtTime(.5, t); g.gain.linearRampToValueAtTime(.5, t+.1); g.gain.exponentialRampToValueAtTime(.001, t+.45);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t+.45);
    const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
    o2.type = 'square'; o2.frequency.setValueAtTime(80, t); o2.frequency.exponentialRampToValueAtTime(30, t+.2);
    g2.gain.setValueAtTime(.3, t); g2.gain.exponentialRampToValueAtTime(.001, t+.2);
    o2.connect(g2); g2.connect(audioCtx.destination); o2.start(t); o2.stop(t+.2);
  }

  function playWinSound() {
    if (!audioCtx) return; resumeAudio();
    const t = audioCtx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), nt = t + i * .13;
      o.type = 'sine'; o.frequency.setValueAtTime(f, nt); o.frequency.linearRampToValueAtTime(f*1.01, nt+.15);
      g.gain.setValueAtTime(0, nt); g.gain.linearRampToValueAtTime(.35, nt+.06); g.gain.setValueAtTime(.35, nt+.25); g.gain.exponentialRampToValueAtTime(.001, nt+.7);
      o.connect(g); g.connect(audioCtx.destination); o.start(nt); o.stop(nt+.7);
    });
    [523, 659, 784].forEach(f => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), nt = t + .55;
      o.type = 'triangle'; o.frequency.setValueAtTime(f, nt);
      g.gain.setValueAtTime(0, nt); g.gain.linearRampToValueAtTime(.2, nt+.15); g.gain.setValueAtTime(.2, nt+.6); g.gain.exponentialRampToValueAtTime(.001, nt+1.2);
      o.connect(g); g.connect(audioCtx.destination); o.start(nt); o.stop(nt+1.2);
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  const toRad = deg => (deg * Math.PI) / 180;
  function polarToXY(a, r) { const rad = toRad(a); return { x: CX + Math.cos(rad) * r, y: CY + Math.sin(rad) * r }; }
  function shortestAngleDiff(a, b) { let d = ((b - a) % 360 + 360) % 360; if (d > 180) d -= 360; return d; }
  function normalizeAngle(d) { return ((d % 360) + 360) % 360; }

  // ── Screen Management ─────────────────────────────────────────────────────
  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => el.classList.toggle('active', k === name));
    state.screen = name;
  }

  // ── Coin Placement ────────────────────────────────────────────────────────
  function placeCoin() {
    state.coinOffset = COIN_MIN_OFFSET + Math.floor(Math.random() * (COIN_MAX_OFFSET - COIN_MIN_OFFSET));
    state.arrowAngleAtCoin = state.arrowAngle;
    state.coinAngle = normalizeAngle(normalizeAngle(state.arrowAngle) + state.coinOffset * state.direction);
  }

  // ── Game Init ─────────────────────────────────────────────────────────────
  function startGame() {
    if (getCredits() < CPC) addCredits(CBONUS);
    spendCredits(CPC);
    
    // Stats & Quests tracker
    if (!userData.stats) userData.stats = { gamesPlayed: 0, wins: 0, totalCoins: 0 };
    userData.stats.gamesPlayed++;
    saveDataToCloud();
    addQuestProgress('play', 1);

    state.arrowAngle = -90; state.direction = 1; state.speed = BASE_SPEED;
    state.speedMult = 1.0; state.hitsLeft = TOTAL_COINS; state.hitsScored = 0;
    state.endless = endlessMode; state.running = true; state.lastTime = null; state.inputLocked = false;
    placeCoin(); updateHUD(); updateCreditsDisplay();
    const d = DIFFICULTIES[currentDifficulty];
    hudDiffBadge.textContent = (state.endless ? '∞ ' : '') + d.label;
    hudDiffBadge.className = 'hud-difficulty ' + currentDifficulty + (state.endless ? ' endless' : '');
    hudDiffBadge.style.display = 'block';
    if (counterLbl) counterLbl.textContent = state.endless ? 'SCORE' : 'TO GO!';
    showScreen('game');
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(gameLoop);
  }

  function stopGame() {
    state.running = false;
    if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
  }

  // ── Main Game Loop ────────────────────────────────────────────────────────
  function gameLoop(ts) {
    if (!state.running) return;
    if (!state.lastTime) state.lastTime = ts;
    const dt = Math.min((ts - state.lastTime) / 1000, 0.05);
    state.lastTime = ts;
    state.arrowAngle += state.speed * state.direction * dt;
    if (!state.inputLocked) {
      const traveled = (state.arrowAngle - state.arrowAngleAtCoin) * state.direction;
      if (traveled > state.coinOffset + DIFFICULTIES[currentDifficulty].hitZone) { handleMiss('passed'); return; }
    }
    render(normalizeAngle(state.arrowAngle), normalizeAngle(state.coinAngle));
    state.rafId = requestAnimationFrame(gameLoop);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function render(a, c) { ctx.clearRect(0, 0, W, H); drawBackground(); drawOuterRing(); drawTrackSegments(a); drawCoin(c); drawArrow(a); drawCenterDisplay(); }

  function drawBackground() {
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, OUTER_R);
    g.addColorStop(0, SK.bg1); g.addColorStop(0.7, SK.bg2); g.addColorStop(1, SK.bg3 || 'rgba(0,0,0,1)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, OUTER_R, 0, Math.PI * 2); ctx.fill();
  }

  function drawOuterRing() {
    ctx.beginPath(); ctx.arc(CX, CY, OUTER_R, 0, Math.PI * 2); ctx.lineWidth = 8;
    const rg = ctx.createLinearGradient(CX - OUTER_R, CY, CX + OUTER_R, CY);
    rg.addColorStop(0, SK.rA); rg.addColorStop(0.5, SK.rB); rg.addColorStop(1, SK.rA);
    ctx.strokeStyle = rg; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, OUTER_R, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = SK.rGlow; ctx.stroke();
  }

  function drawTrackSegments(arrowAngle) {
    const SEG_ARC = (360 / TRACK_SEGMENTS) * 0.7;
    const [tr, tg, tb] = SK.track;
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      const s0 = toRad(i * (360 / TRACK_SEGMENTS) - 90), s1 = toRad(i * (360 / TRACK_SEGMENTS) - 90 + SEG_ARC);
      const mid = i * (360 / TRACK_SEGMENTS) + SEG_ARC / 2 - 90;
      const prx = Math.max(0, 1 - Math.abs(shortestAngleDiff(arrowAngle, mid)) / 60);
      const alpha = 0.25 + prx * 0.5, f = 0.55 + prx * 0.45;
      ctx.beginPath(); ctx.arc(CX, CY, TRACK_R, s0, s1); ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${Math.floor(tr*f)},${Math.floor(tg*f)},${Math.floor(tb*f)},${alpha})`; ctx.stroke();
      ctx.beginPath(); ctx.arc(CX, CY, TRACK_R - 8, s0, s1); ctx.lineWidth = 2;
      ctx.strokeStyle = `${SK.arrowGlow}${alpha * 0.5})`; ctx.stroke();
    }
  }

  function drawCoin(coinAngle) {
    const isZoneActive = userData.activeAddons && userData.activeAddons.includes('zone_' + currentDifficulty);

    if (isZoneActive) {
      const hz = DIFFICULTIES[currentDifficulty].hitZone;
      const startAngle = toRad(coinAngle - hz - 90);
      const endAngle = toRad(coinAngle + hz - 90);

      ctx.beginPath();
      ctx.arc(CX, CY, TRACK_R, startAngle, endAngle);
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.strokeStyle = SK.coinFill;
      ctx.shadowColor = SK.coinFill;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(CX, CY, TRACK_R, startAngle, endAngle);
      ctx.lineWidth = 4;
      ctx.strokeStyle = SK.coinLight;
      ctx.stroke();

      const pos = polarToXY(coinAngle - 90, TRACK_R);
      ctx.fillStyle = SK.coinText; ctx.font = 'bold 10px Orbitron,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', pos.x, pos.y + 0.5);
      
      return;
    }

    const pos = polarToXY(coinAngle - 90, TRACK_R);
    if (SK.coinGlow !== 'transparent' && !SK.coinGlow.includes('-1')) {
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, COIN_R * 1.6);
      glow.addColorStop(0, `${SK.coinGlow}.45)`); glow.addColorStop(0.6, `${SK.coinGlow}.15)`); glow.addColorStop(1, `${SK.coinGlow}0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(pos.x, pos.y, COIN_R * 1.6, 0, Math.PI * 2); ctx.fill();
    }
    
    // Cartoon coin base
    ctx.beginPath(); ctx.arc(pos.x, pos.y, COIN_R, 0, Math.PI * 2);
    ctx.fillStyle = SK.coinFill; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#000000'; ctx.stroke();
    
    // Cartoon coin highlight inner ring
    ctx.beginPath(); ctx.arc(pos.x - 2, pos.y - 2, COIN_R - 5, 0, Math.PI * 2);
    ctx.lineWidth = 2.5; ctx.strokeStyle = SK.coinLight; ctx.stroke();

    ctx.fillStyle = '#000000'; ctx.font = '900 13px Orbitron,monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; 
    ctx.fillText('$', pos.x, pos.y + 1.5);
  }

  function drawArrow(arrowAngle) {
    for (let t = 1; t <= TRAIL_LENGTH; t++) {
      const ta = arrowAngle - state.direction * t * (state.speed / 60) * 2;
      const tp = polarToXY(ta - 90, ARROW_R);
      ctx.beginPath(); ctx.arc(tp.x, tp.y, 5 - t * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = SK.arrowGlow === 'transparent' ? 'transparent' : `${SK.arrowGlow}${(1 - t / TRAIL_LENGTH) * 0.3})`;
      ctx.fill();
    }
    const hp = polarToXY(arrowAngle - 90, ARROW_R);
    const ag = ctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, 22);
    ag.addColorStop(0, SK.arrowGlow === 'transparent' ? 'transparent' : `${SK.arrowGlow}0.6)`);
    ag.addColorStop(0.5, SK.arrowGlow === 'transparent' ? 'transparent' : `${SK.arrowGlow}0.2)`);
    ag.addColorStop(1, SK.arrowGlow === 'transparent' ? 'transparent' : `${SK.arrowGlow}0)`);
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(hp.x, hp.y, 22, 0, Math.PI * 2); ctx.fill();
    const tp2 = polarToXY(arrowAngle - 90, ARROW_R - ARROW_LEN);
    ctx.beginPath(); ctx.moveTo(tp2.x, tp2.y); ctx.lineTo(hp.x, hp.y);
    ctx.strokeStyle = SK.arrow; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.shadowColor = SK.arrowGlow === 'transparent' ? 'transparent' : SK.arrow; ctx.shadowBlur = SK.arrowGlow === 'transparent' ? 0 : 15; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(hp.x, hp.y, 7, 0, Math.PI * 2); ctx.fillStyle = SK.arrowHead;
    ctx.shadowColor = SK.arrowGlow === 'transparent' ? 'transparent' : SK.arrow; ctx.shadowBlur = SK.arrowGlow === 'transparent' ? 0 : 20; ctx.fill(); ctx.shadowBlur = 0;
    drawArrowWings(arrowAngle, hp);
  }

  function drawArrowWings(angle, hp) {
    if (SK.arrowWings === 'transparent') return;
    const pr = toRad(angle), wx = Math.cos(pr) * 8, wy = Math.sin(pr) * 8;
    const bx = Math.cos(toRad(angle - 90 + 180)) * 10, by = Math.sin(toRad(angle - 90 + 180)) * 10;
    ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(hp.x + bx + wx, hp.y + by + wy);
    ctx.moveTo(hp.x, hp.y); ctx.lineTo(hp.x + bx - wx, hp.y + by - wy);
    ctx.strokeStyle = SK.arrowWings; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke();
  }

  function drawCenterDisplay() {
    const ig = ctx.createRadialGradient(CX, CY, 0, CX, CY, INNER_R);
    ig.addColorStop(0, SK.cIn); ig.addColorStop(0.8, SK.cMid); ig.addColorStop(1, SK.cOut);
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(CX, CY, INNER_R, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(CX, CY, INNER_R, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = SK.cGlow; ctx.stroke();
    for (let i = 0; i < 16; i++) {
      const p = polarToXY(i * (360 / 16) - 90, INNER_R - 12);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = SK.cDots; ctx.fill();
    }
  }

  // ── Hit / Miss Handling ───────────────────────────────────────────────────
  function handleHit() {
    if (state.inputLocked) return;
    state.inputLocked = true;
    state.hitsScored++;
    state.hitsLeft--;
    state.speed *= (1 + DIFFICULTIES[currentDifficulty].speedInc);
    state.speedMult = state.speed / BASE_SPEED;
    state.direction *= -1;
    
    // Core game state
    addCredits(CPcoin);
    if (!userData.stats) userData.stats = { gamesPlayed: 0, wins: 0, totalCoins: 0 };
    userData.stats.totalCoins++;
    saveDataToCloud();
    addQuestProgress('coins', 1);

    playHitSound(state.hitsScored);
    triggerFeedback('hit');
    bumpCounter();
    updateHUD();

    if (!state.endless && state.hitsLeft <= 0) { stopGame(); setTimeout(showWin, 600); return; }
    if (state.endless) counterEl.textContent = state.hitsScored; // show score in endless
    placeCoin();
    setTimeout(() => { state.inputLocked = false; }, 250);
  }

  function handleMiss() {
    if (state.inputLocked) return;
    state.inputLocked = true;
    stopGame();
    if (state.endless) updateHS(currentDifficulty, state.hitsScored);
    playMissSound(); triggerFeedback('miss'); shakeCanvas();
    setTimeout(() => showGameOver(), 700);
  }

  function triggerFeedback(type) {
    hitFeedback.className = 'hit-feedback ' + type;
    void hitFeedback.offsetWidth;
    hitFeedback.className = 'hit-feedback ' + type;
  }

  function shakeCanvas() {
    canvas.style.animation = 'none'; void canvas.offsetWidth;
    canvas.style.animation = 'shake .35s ease-out';
    setTimeout(() => { canvas.style.animation = ''; }, 350);
  }

  function bumpCounter() {
    counterEl.classList.remove('bump'); void counterEl.offsetWidth;
    counterEl.classList.add('bump');
    setTimeout(() => counterEl.classList.remove('bump'), 300);
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  function updateHUD() {
    counterEl.textContent = state.endless ? state.hitsScored : state.hitsLeft;
    hudSpeed.textContent = state.speedMult.toFixed(1) + 'x';
    hudHits.textContent = state.hitsScored;
    const cv = document.getElementById('hud-credits-val');
    if (cv) cv.textContent = getCredits();
  }

  function updateCreditsDisplay() {
    const c = getCredits();
    const sv = document.getElementById('start-credits-val'); if (sv) sv.textContent = c;
    const ss = document.getElementById('start-credits-strip'); if (ss) ss.classList.toggle('low', c < CPC * 2);
    const hv = document.getElementById('hud-credits-val'); if (hv) hv.textContent = c;
    const shv = document.getElementById('shop-credits-val'); if (shv) shv.textContent = c;
  }

  // ── End Screens ───────────────────────────────────────────────────────────
  function showGameOver() {
    goHits.textContent = state.hitsScored;
    goSpeed.textContent = state.speedMult.toFixed(1) + 'x';
    const earned = state.hitsScored * CPcoin;
    document.getElementById('go-credits-earned').textContent = earned;
    document.getElementById('go-credits-balance').textContent = getCredits();
    const endDiv = document.getElementById('go-endless-stats');
    if (endDiv) {
      if (state.endless) {
        const hs = getHS(currentDifficulty);
        endDiv.style.display = 'flex';
        endDiv.innerHTML = `<span class="hs-label">∞ ENDLESS ${DIFFICULTIES[currentDifficulty].label}</span><span class="hs-val">🏆 MEJOR: ${hs} monedas</span>`;
      } else { endDiv.style.display = 'none'; }
    }
    updateCreditsDisplay();
    showScreen('gameover');
  }

  function showWin() {
    // Mark difficulty as beaten and unlock endless
    const wasAlreadyBeaten = isBeaten(currentDifficulty);
    markBeaten(currentDifficulty);
    updateEndlessUI();

    // Stats & Quests tracker
    if (!userData.stats) userData.stats = { gamesPlayed: 0, wins: 0, totalCoins: 0 };
    userData.stats.wins++;
    saveDataToCloud();
    addQuestProgress('win', 1);

    const earned = TOTAL_COINS * CPcoin;
    document.getElementById('win-credits-earned').textContent = earned;
    document.getElementById('win-credits-balance').textContent = getCredits();

    // Show unlock notification if first time
    const unlockDiv = document.getElementById('win-endless-unlock');
    if (unlockDiv) {
      if (!wasAlreadyBeaten) {
        unlockDiv.innerHTML = `🔓 MODO ENDLESS ${DIFFICULTIES[currentDifficulty].label} DESBLOQUEADO`;
        unlockDiv.style.display = 'block'; unlockDiv.style.opacity = '1';
        setTimeout(() => { unlockDiv.style.opacity = '0'; }, 2800);
      } else { unlockDiv.style.display = 'none'; }
    }

    playWinSound(); spawnParticles(); showScreen('win');
  }

  function spawnParticles() {
    winParticles.innerHTML = '';
    const colors = [SK.coinFill, SK.arrow, '#FF3A5C', '#39FF14', '#FF8C00', '#FFFFFF'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div'); p.className = 'particle';
      const size = Math.random() * 10 + 5;
      p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random()*100}%;top:${-size}px;background:${colors[Math.floor(Math.random()*colors.length)]};animation-duration:${1.5+Math.random()*2}s;animation-delay:${Math.random()}s;opacity:${0.7+Math.random()*0.3};`;
      winParticles.appendChild(p);
    }
  }

  // ── Shop ──────────────────────────────────────────────────────────────────
  function openShop() {
    renderShopScreen();
    updateCreditsDisplay();
    showScreen('shop');
  }

  function renderShopScreen() {
    const grid = document.getElementById('shop-grid'); if (!grid) return;
    const activeSkin = getActiveSkin();
    
    // SKINS SECTION
    grid.innerHTML = '<div class="shop-section-title">🎨 TUS SKINS</div>';
    Object.entries(SKINS).forEach(([id, skin]) => {
      const owned = isOwned(id), active = id === activeSkin;
      const canBuy = !owned && getCredits() >= skin.cost;
      const card = document.createElement('div');
      card.className = `skin-card${active ? ' skin-active' : ''}`;
      card.innerHTML = `
        <div class="skin-preview sp-${id}">
          <div class="sp-ring"></div><div class="sp-arrow"></div><div class="sp-coin"></div>
        </div>
        <div class="skin-name">${skin.name}</div>
        <div class="skin-sub">${skin.sub}</div>
        <button class="skin-action-btn${active ? ' btn-active' : owned ? ' btn-owned' : canBuy ? '' : ' btn-cantbuy'}"
                data-skin="${id}" ${!owned && !canBuy ? 'disabled' : ''}>
          ${active ? '✓ ACTIVA' : owned ? 'USAR' : `COMPRAR 🪙${skin.cost}`}
        </button>`;
      grid.appendChild(card);
    });

    // ADDONS SECTION
    const tmpDiv = document.createElement('div');
    tmpDiv.className = 'shop-section-title';
    tmpDiv.textContent = '🎯 MEJORAS: GUÍAS DE ZONA';
    grid.appendChild(tmpDiv);

    Object.entries(ADDONS).forEach(([id, addon]) => {
      const owned = userData.addons && userData.addons.includes(id);
      const active = userData.activeAddons && userData.activeAddons.includes(id);
      const unlocked = !addon.req || isBeaten(addon.req);
      const canBuy = unlocked && !owned && getCredits() >= addon.cost;

      const card = document.createElement('div');
      card.className = `skin-card ${active ? 'skin-active' : ''} ${!unlocked ? 'locked' : ''}`;
      
      let btnHTML = '';
      if (!unlocked) {
        btnHTML = `<button class="skin-action-btn btn-cantbuy" disabled>🔒 REQUIERE ${addon.req.toUpperCase()}</button>`;
      } else if (active) {
        btnHTML = `<button class="addon-action-btn btn-active" data-id="${id}">✓ ACTIVADO</button>`;
      } else if (owned) {
        btnHTML = `<button class="addon-action-btn btn-owned" data-id="${id}">ACTIVAR</button>`;
      } else {
        btnHTML = `<button class="addon-action-btn ${canBuy ? '' : 'btn-cantbuy'}" data-id="${id}" ${canBuy ? '' : 'disabled'}>COMPRAR 🪙${addon.cost}</button>`;
      }

      card.innerHTML = `
        <div class="addon-preview">🎯</div>
        <div class="skin-name">${addon.name}</div>
        <div class="skin-sub">${addon.sub}</div>
        ${btnHTML}
      `;
      grid.appendChild(card);
    });

    // EVENT LISTENERS
    grid.querySelectorAll('.skin-action-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.skin;
        if (!id) return;
        if (!isOwned(id) && SKINS[id].cost > 0) {
          if (getCredits() < SKINS[id].cost) return;
          spendCredits(SKINS[id].cost);
          addOwned(id);
        }
        applySkin(id);
        updateCreditsDisplay();
        renderShopScreen();
      });
    });

    grid.querySelectorAll('.addon-action-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        if (!userData.addons) userData.addons = [];
        if (!userData.activeAddons) userData.activeAddons = [];

        if (!userData.addons.includes(id)) {
          if (getCredits() < ADDONS[id].cost) return;
          spendCredits(ADDONS[id].cost);
          userData.addons.push(id);
          userData.activeAddons.push(id); // auto-activate
        } else {
          // Toggle activation
          if (userData.activeAddons.includes(id)) {
            userData.activeAddons = userData.activeAddons.filter(a => a !== id);
          } else {
            userData.activeAddons.push(id);
          }
        }
        saveDataToCloud();
        updateCreditsDisplay();
        renderShopScreen();
      });
    });
  }

  // ── Profile & Quests ──────────────────────────────────────────────────────
  function openProfile() {
    checkAndInitQuests();
    renderProfileScreen();
    showScreen('profile');
  }

  function renderProfileScreen() {
    document.getElementById('profile-credits-val').textContent = getCredits();
    
    // Render Stats
    const st = userData.stats || { gamesPlayed: 0, wins: 0, totalCoins: 0 };
    document.getElementById('st-games').textContent = st.gamesPlayed;
    document.getElementById('st-wins').textContent = st.wins;
    document.getElementById('st-coins').textContent = st.totalCoins;
    
    const wr = st.gamesPlayed > 0 ? Math.round((st.wins / st.gamesPlayed) * 100) : 0;
    document.getElementById('st-wr').textContent = wr + '%';

    // Render Quests
    const qContainer = document.getElementById('quests-container');
    qContainer.innerHTML = '';
    
    (userData.quests || []).forEach((q, idx) => {
      const isDone = q.progress >= q.target;
      const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
      
      const el = document.createElement('div');
      el.className = `quest-card ${isDone && !q.claimed ? 'q-done' : ''}`;
      el.innerHTML = `
        <div class="q-title">${q.title}</div>
        <div class="q-info">
          <span>${q.progress} / ${q.target}</span>
          <span class="q-reward">🪙 +${q.reward}</span>
        </div>
        <div class="q-progress-bar">
          <div class="q-progress-fill" style="width: ${pct}%"></div>
        </div>
        <button class="btn-claim ${!isDone || q.claimed ? 'claimed' : ''}" data-idx="${idx}" ${!isDone || q.claimed ? 'disabled' : ''}>
          ${q.claimed ? 'RECLAMADO' : (isDone ? 'RECLAMAR' : 'EN PROGRESO')}
        </button>
      `;
      qContainer.appendChild(el);
    });

    // Delegate claim clicks
    qContainer.querySelectorAll('.btn-claim:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = e.target.dataset.idx;
        const q = userData.quests[idx];
        if (q && q.progress >= q.target && !q.claimed) {
          q.claimed = true;
          addCredits(q.reward);
          saveDataToCloud();
          renderProfileScreen();
        }
      });
    });
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  function onPlayerInput() {
    if (state.screen !== 'game' || !state.running || state.inputLocked) return;
    const na = normalizeAngle(state.arrowAngle), nc = normalizeAngle(state.coinAngle);
    const diff = Math.abs(shortestAngleDiff(na, nc));
    if (diff <= DIFFICULTIES[currentDifficulty].hitZone) handleHit(); else handleMiss();
  }

  // ── Event Listeners ───────────────────────────────────────────────────────
  btnStart.addEventListener('click',    e => { e.stopPropagation(); startGame(); });
  btnRetry.addEventListener('click',    e => { e.stopPropagation(); startGame(); });
  btnPlayAgain.addEventListener('click',e => { e.stopPropagation(); startGame(); });
  btnAction.addEventListener('click',   e => { e.stopPropagation(); onPlayerInput(); });
  btnAction.addEventListener('touchstart', e => { e.preventDefault(); onPlayerInput(); }, { passive: false });

  document.getElementById('btn-shop')?.addEventListener('click',      e => { e.stopPropagation(); openShop(); });
  document.getElementById('btn-shop-back')?.addEventListener('click', e => { e.stopPropagation(); showScreen('start'); updateEndlessUI(); });
  document.getElementById('btn-go-shop')?.addEventListener('click',   e => { e.stopPropagation(); openShop(); });
  document.getElementById('btn-win-shop')?.addEventListener('click',  e => { e.stopPropagation(); openShop(); });

  document.getElementById('btn-profile')?.addEventListener('click',      e => { e.stopPropagation(); openProfile(); });
  document.getElementById('btn-profile-back')?.addEventListener('click', e => { e.stopPropagation(); showScreen('start'); });

  document.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      if (state.screen === 'game') onPlayerInput();
      else if (['start', 'gameover', 'win'].includes(state.screen)) startGame();
    }
  });
  document.addEventListener('click', e => {
    if (state.screen === 'game' && e.target !== btnAction) onPlayerInput();
  });

  // ── Idle Animation (start screen) ─────────────────────────────────────────
  (function idleRender() {
    let angle = -90, lastT = null, rafId = null;
    function loop(t) {
      if (state.screen !== 'start') return;
      if (!lastT) lastT = t;
      const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t;
      angle += 80 * dt;
      render(normalizeAngle(angle), normalizeAngle(45));
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    function stop() { if (rafId) cancelAnimationFrame(rafId); }
    btnStart.addEventListener('click', stop);
    btnRetry.addEventListener('click', stop);
    btnPlayAgain.addEventListener('click', stop);
  })();

  // ── AUTHENTICATION & APP BOOTSTRAP ─────────────────────────────────────────

  const authForm = document.getElementById('auth-form');
  const authEmail = document.getElementById('auth-email');
  const authPass = document.getElementById('auth-pass');
  const authError = document.getElementById('auth-error');
  const btnRegister = document.getElementById('btn-register');
  const btnLogout = document.getElementById('btn-logout');
  const btnGoogle = document.getElementById('btn-google');

  function showAuthError(msg) {
    authError.textContent = msg;
    authError.style.display = 'block';
  }

  // Register Event
  if (btnRegister) {
    btnRegister.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!authEmail.value || !authPass.value) { showAuthError("Rellena email y contraseña"); return; }
      try {
        const u = await createUserWithEmailAndPassword(auth, authEmail.value, authPass.value);
        await setDoc(doc(db, "users", u.user.uid), userData); // Upload initial full DB object
      } catch (err) {
        if(err.code === 'auth/email-already-in-use') showAuthError("Ese email ya está registrado.");
        else if (err.code === 'auth/weak-password') showAuthError("Contraseña muy débil (mín. 6 chars).");
        else showAuthError(err.message);
      }
    });
  }

  // Login Event
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await signInWithEmailAndPassword(auth, authEmail.value, authPass.value);
      } catch (err) {
        showAuthError("Credenciales incorrectas o usuario inexistente.");
      }
    });
  }

  // Google Login Event
  if (btnGoogle) {
    btnGoogle.addEventListener('click', async () => {
      try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        // onAuthStateChanged handled the rest
      } catch (err) {
        showAuthError("Error al iniciar sesión con Google.");
        console.error(err);
      }
    });
  }

  // Logout Event
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      signOut(auth);
    });
  }

  // Listen to Auth State
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is logged in
      currentUser = user;
      
      try {
        // Download cloud save
        const docSnap = await getDoc(doc(db, "users", user.uid));
        if (docSnap.exists()) {
          const loadedData = docSnap.data();
          // Merge avoiding undefined properties breaking the structure
          userData = {
            credits: loadedData.credits !== undefined ? loadedData.credits : 100,
            owned: loadedData.owned || ['cyclone'],
            beaten: loadedData.beaten || [],
            hs: loadedData.hs || {},
            stats: loadedData.stats || { gamesPlayed: 0, wins: 0, totalCoins: 0 },
            quests: loadedData.quests || [],
            addons: loadedData.addons || [],
            activeAddons: loadedData.activeAddons || []
          };
        } else {
          // If no doc exists (legacy creation or something failed), create it
          await setDoc(doc(db, "users", user.uid), userData);
        }
      } catch(e) {
        console.error("No se pudieron cargar los datos", e);
      }

      // Initialize App HUD
      applySkin(getActiveSkin());
      updateCreditsDisplay();
      updateEndlessUI();
      syncDiffBtns();

      showScreen('start');
    } else {
      // User is logged out
      currentUser = null;
      if(authError) authError.style.display = 'none';
      if(authForm) authForm.reset();
      showScreen('auth');
    }
  });
