import { store, auth } from "./store.js";

const state = {
  phase: "idle", // idle | armed | running | stopping
  sessionId: null,
  sessions: [],
  solves: [],
  rollups: [],
  startMs: 0,
  elapsedMs: 0,
  raf: null,
  holdTimer: null,
  holding: false,
  lastSolveId: null,
  activeSolveId: null,
  themeId: "light",
  settings: {},
  scrambleList: [],
  scrambleIndex: -1,
  pendingScramble: null,
  event: "333",
};

const el = {
  readout: document.getElementById("readout"),
  hint: document.getElementById("hint"),
  scramble: document.getElementById("scramble"),
  instrument: document.querySelector(".instrument"),
  sessionBtn: document.getElementById("session-btn"),
  sessionPop: document.getElementById("session-pop"),
  eventBtn: document.getElementById("event-btn"),
  eventPop: document.getElementById("event-pop"),
  newSession: document.getElementById("new-session"),
  cube: document.getElementById("cube"),
  solveList: document.getElementById("solve-list"),
  penaltyBar: document.getElementById("penalty-bar"),
  modal: document.getElementById("solve-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalTime: document.getElementById("modal-time"),
  modalScramble: document.getElementById("modal-scramble"),
  modalPlusTwo: document.getElementById("modal-plus-two"),
  modalDnf: document.getElementById("modal-dnf"),
  modalDelete: document.getElementById("modal-delete"),
  modalMo3: document.getElementById("modal-mo3"),
  modalAo5: document.getElementById("modal-ao5"),
  modalAo12: document.getElementById("modal-ao12"),
  rollupPop: document.getElementById("rollup-pop"),
  rollupTitle: document.getElementById("rollup-title"),
  rollupList: document.getElementById("rollup-list"),
  metaSolved: document.getElementById("meta-solved"),
  metaRank: document.getElementById("meta-rank"),
  metaDeviation: document.getElementById("meta-deviation"),
  metaMoves: document.getElementById("meta-moves"),
  metaSession: document.getElementById("meta-session"),
  sparkline: document.getElementById("sparkline"),
  sparklinePath: document.getElementById("sparkline-path"),
  sparklineBest: document.getElementById("sparkline-best"),
  sparklineWorst: document.getElementById("sparkline-worst"),
  sparkEmpty: document.getElementById("spark-empty"),
  themesBtn: document.getElementById("themes-btn"),
  themesPop: document.getElementById("themes-pop"),
  themesSearch: document.getElementById("themes-search"),
  themesList: document.getElementById("themes-list"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsPop: document.getElementById("settings-pop"),
  scrambleSize: document.getElementById("scramble-size"),
  scrambleSizeValue: document.getElementById("scramble-size-value"),
  scrambleVisible: document.getElementById("scramble-visible"),
  cubeVisible: document.getElementById("cube-visible"),
  cubeSize: document.getElementById("cube-size"),
  cubeSizeValue: document.getElementById("cube-size-value"),
  font: document.getElementById("font"),
  confirmModal: document.getElementById("confirm-modal"),
  confirmTime: document.getElementById("confirm-time"),
  confirmText: document.getElementById("confirm-text"),
  confirmKeep: document.getElementById("confirm-keep"),
  confirmRedo: document.getElementById("confirm-redo"),
  signInBtn: document.getElementById("signin-btn"),
  signOutBtn: document.getElementById("signout-btn"),
  profileWrap: document.getElementById("profile-wrap"),
  profileBtn: document.getElementById("profile-btn"),
  profileAvatar: document.getElementById("profile-avatar"),
  profilePop: document.getElementById("profile-pop"),
  profilePopAvatar: document.getElementById("profile-pop-avatar"),
  profilePopName: document.getElementById("profile-pop-name"),
  profileEmail: document.getElementById("profile-email"),
  menuBtn: document.getElementById("menu-btn"),
  drawer: document.getElementById("drawer"),
  drawerClose: document.getElementById("drawer-close"),
  historyToggle: document.getElementById("history-toggle"),
};

const statEl = {
  curTime: document.getElementById("stat-cur-time"),
  curMo3: document.getElementById("stat-cur-mo3"),
  curAo5: document.getElementById("stat-cur-ao5"),
  curAo12: document.getElementById("stat-cur-ao12"),
  bestTime: document.getElementById("stat-best-time"),
  bestMo3: document.getElementById("stat-best-mo3"),
  bestAo5: document.getElementById("stat-best-ao5"),
  bestAo12: document.getElementById("stat-best-ao12"),
};

const ARMED_MS = 300;

const IDLE_HINT = window.matchMedia("(pointer: coarse)").matches
  ? "hold to start"
  : 'hold to start · or press <kbd>space</kbd>';

const EVENTS = [
  { id: "222", name: "2x2", puzzle: "2x2x2" },
  { id: "333", name: "3x3", puzzle: "3x3x3" },
  { id: "333oh", name: "3x3 OH", puzzle: "3x3x3" },
  { id: "333bf", name: "3x3 BLD", puzzle: "3x3x3" },
  { id: "444", name: "4x4", puzzle: "4x4x4", scale: 1.3 },
  { id: "555", name: "5x5", puzzle: "5x5x5", scale: 1.5 },
  { id: "666", name: "6x6", puzzle: "6x6x6", scale: 1.7 },
  { id: "777", name: "7x7", puzzle: "7x7x7", scale: 1.9 },
  { id: "444bf", name: "4x4 BLD", puzzle: "4x4x4", scale: 1.3 },
  { id: "555bf", name: "5x5 BLD", puzzle: "5x5x5", scale: 1.5 },
  { id: "clock", name: "Clock", puzzle: "clock", scale: 1.1 },
  { id: "minx", name: "Megaminx", puzzle: "megaminx", scale: 1.7 },
  { id: "pyram", name: "Pyraminx", puzzle: "pyraminx", scale: 1.1 },
  { id: "skewb", name: "Skewb", puzzle: "skewb", scale: 1.1 },
  { id: "sq1", name: "Square-1", puzzle: "square-1", scale: 1.2 },
];

function applyEventScale() {
  const ev = EVENTS.find((e) => e.id === state.event);
  document.documentElement.style.setProperty("--scramble-event-scale", String(ev ? ev.scale || 1 : 1));
}

/* ---------- formatting ---------- */

function formatTime(ms, decimals = 3) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 0) ms = 0;
  const gran = 10 ** (3 - decimals);
  const rounded = Math.round(ms / gran) * gran;
  const totalSec = rounded / 1000;
  const m = Math.floor(totalSec / 60);
  const s = totalSec - m * 60;
  const msPart = String(rounded % 1000).padStart(3, "0").slice(0, decimals);
  if (m > 0) {
    return `${m}:${String(Math.floor(s)).padStart(2, "0")}.${msPart}`;
  }
  return `${s.toFixed(decimals)}`;
}

function formatSolveTime(solve) {
  if (solve.penalty === "DNF") return "DNF";
  const base = formatTime(solve.adjusted_ms);
  return solve.penalty === "PLUS_TWO" ? `${base}+` : base;
}

function penaltyClass(p) {
  return p === "PLUS_TWO" ? "plus-two" : p === "DNF" ? "dnf" : "";
}

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

function formatStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sessionName(id) {
  const s = state.sessions.find((x) => x.id === id);
  return s ? s.name : "";
}

function solveRank(solve) {
  const ranked = state.solves
    .filter((s) => s.penalty !== "DNF")
    .sort((a, b) => a.adjusted_ms - b.adjusted_ms);
  const pos = ranked.findIndex((s) => s.id === solve.id);
  if (pos === -1) return null;
  return { rank: pos + 1, of: ranked.length };
}

function sessionMean() {
  const vals = state.solves
    .filter((s) => s.penalty !== "DNF")
    .map((s) => s.adjusted_ms);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/* ---------- api ---------- */

/* ---------- scramble ---------- */

const SCRAMBLE_FACES = ["U", "D", "L", "R", "F", "B"];
const SCRAMBLE_SUFFIXES = ["", "'", "2"];

function generateFallbackScramble(length = 21) {
  const moves = [];
  let prev = "";
  while (moves.length < length) {
    const face = SCRAMBLE_FACES[Math.floor(Math.random() * SCRAMBLE_FACES.length)];
    if (face === prev) continue;
    const suffix = SCRAMBLE_SUFFIXES[Math.floor(Math.random() * SCRAMBLE_SUFFIXES.length)];
    moves.push(face + suffix);
    prev = face;
  }
  return moves.join(" ");
}

function setCubeAlg(moves) {
  try {
    el.cube.alg = moves;
  } catch (err) {
    /* cube is optional; ignore */
  }
}

function fitScramble() {
  const s = el.scramble;
  s.style.fontSize = "";
  s.style.maxHeight = "";
  const max = parseFloat(getComputedStyle(s).fontSize);
  const min = 9;
  const ev = EVENTS.find((e) => e.id === state.event);
  const narrowPortrait = window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches;
  const maxLines = ev && (ev.scale || 1) >= 1.7 ? 5 : narrowPortrait ? 4 : 3;
  const cap = (sz) => {
    s.style.maxHeight = `${maxLines * sz * 1.55}px`;
  };
  let size = max;
  cap(size);
  while (size > min && s.scrollHeight > s.clientHeight + 1) {
    size -= 0.5;
    s.style.fontSize = `${size}px`;
    cap(size);
  }
  s.title = s.textContent;
}

/* ---------- cube colors ---------- */

const DEFAULT_CUBE_COLORS = {
  U: "#ffffff",
  D: "#ffd500",
  F: "#009b48",
  B: "#0046ad",
  R: "#b71234",
  L: "#ff5800",
};

let cubeColors = { ...DEFAULT_CUBE_COLORS };

function applyCubeColors() {
  try {
    el.cube.stickers = { ...cubeColors };
  } catch (err) {
    /* cube not upgraded yet; retried on next scramble */
  }
}

/* ---------- settings ---------- */

const SETTINGS_KEY = "x3.settings";
const SESSION_KEY = "x3.session";

const FONT_OPTIONS = [
  "Space Grotesk", "Space Mono", "Inter", "JetBrains Mono", "Manrope",
  "IBM Plex Sans", "IBM Plex Mono", "Fira Code", "Sora", "Outfit",
  "Roboto Mono", "DM Mono", "Inconsolata", "Public Sans",
];

function loadFont(name) {
  if (!name) return;
  const id = `gf-${name.replace(/\s+/g, "-").toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;
  document.head.appendChild(link);
}

function applySettings() {
  document.documentElement.style.setProperty("--scramble-size", `${state.settings.scrambleSize / 100}`);
  el.scrambleSizeValue.textContent = `${state.settings.scrambleSize}%`;
  el.scrambleVisible.checked = !!state.settings.showScramble;
  document.body.classList.toggle("scramble-hidden", !state.settings.showScramble);
  el.cubeVisible.checked = state.settings.cubeVisible;
  document.body.classList.toggle("cube-hidden", !state.settings.cubeVisible);
  document.documentElement.style.setProperty("--cube-size", `${state.settings.cubeSize}px`);
  el.cubeSizeValue.textContent = String(state.settings.cubeSize);
  document.documentElement.style.setProperty("--font-display", `"${state.settings.fontDisplay}"`);
  document.documentElement.style.setProperty("--font-mono", `"${state.settings.fontMono}"`);
  loadFont(state.settings.fontDisplay);
  loadFont(state.settings.fontMono);
  fitScramble();
}

function fillFontSelect(sel, names, current) {
  sel.innerHTML = "";
  for (const n of names) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  }
  sel.value = names.includes(current) ? current : names[0];
}

function initSettings() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  } catch (err) {
    /* ignore */
  }
  state.settings = {
    scrambleSize: 100,
    showScramble: true,
    cubeVisible: true,
    cubeSize: 118,
    fontDisplay: "Space Grotesk",
    fontMono: "Space Mono",
    ...(saved || {}),
  };
  if (saved && saved.font) {
    state.settings.fontDisplay = saved.font;
    state.settings.fontMono = saved.font;
  }
  fillFontSelect(el.font, FONT_OPTIONS, state.settings.fontDisplay);
  el.scrambleSize.value = state.settings.scrambleSize;
  el.cubeSize.value = state.settings.cubeSize;
  applySettings();
  el.scrambleSize.addEventListener("input", () => {
    state.settings.scrambleSize = Number(el.scrambleSize.value);
    saveSettings();
    applySettings();
  });
  el.cubeSize.addEventListener("input", () => {
    state.settings.cubeSize = Number(el.cubeSize.value);
    saveSettings();
    applySettings();
  });
  el.scrambleVisible.addEventListener("change", () => {
    state.settings.showScramble = el.scrambleVisible.checked;
    saveSettings();
    applySettings();
  });
  el.cubeVisible.addEventListener("change", () => {
    state.settings.cubeVisible = el.cubeVisible.checked;
    saveSettings();
    applySettings();
  });
  el.font.addEventListener("change", () => {
    const f = el.font.value;
    state.settings.font = f;
    state.settings.fontDisplay = f;
    state.settings.fontMono = f;
    saveSettings();
    applySettings();
  });
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  } catch (err) {
    /* ignore */
  }
}

/* ---------- themes ---------- */

const THEME_KEY = "x3.theme";
const SYSTEM_THEMES = [
  { id: "light", name: "x3 · Light", group: "x3", dark: false },
  { id: "dark", name: "x3 · Dark", group: "x3", dark: true },
];

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function applyTheme(id) {
  const root = document.documentElement;
  const theme =
    SYSTEM_THEMES.find((t) => t.id === id) || (window.THEMES || []).find((t) => t.id === id);
  if (!theme) return;
  state.themeId = id;
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch (err) {
    /* ignore */
  }
  if (theme.colors) {
    const c = theme.colors;
    const ink = hexToRgb(c.ink);
    root.style.setProperty("--face", c.face);
    root.style.setProperty("--face-deep", c.faceDeep);
    root.style.setProperty("--ink", c.ink);
    root.style.setProperty("--ink-soft", c.inkSoft);
    root.style.setProperty("--accent", c.accent);
    root.style.setProperty("--ok", c.ok);
    root.style.setProperty("--bad", c.bad);
    root.style.setProperty("--brass", c.brass);
    root.style.setProperty("--hair", `rgba(${ink.r},${ink.g},${ink.b},0.14)`);
    root.style.setProperty("--hair-strong", `rgba(${ink.r},${ink.g},${ink.b},0.3)`);
    root.style.setProperty(
      "--shadow",
      theme.dark ? "0 6px 18px rgba(0,0,0,0.55)" : "0 6px 18px rgba(16,18,26,0.12)"
    );
    const tc = cubeColorsFromTheme(theme);
    if (tc) {
      cubeColors = tc;
      applyCubeColors();
    }
  } else {
    root.removeAttribute("style");
    root.dataset.theme = theme.dark ? "dark" : "light";
    cubeColors = { ...DEFAULT_CUBE_COLORS };
    applyCubeColors();
  }
  if (window.refreshFavicon) window.refreshFavicon();
}

function cubeColorsFromTheme(theme) {
  if (!theme.colors) return null;
  const c = theme.colors;
  return { U: c.face, D: c.brass, F: c.ok, B: c.accent, R: c.bad, L: c.ink };
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
    return;
  }
  applyTheme("star-wars");
}

function renderThemesList(listEl, searchEl) {
  listEl.innerHTML = "";
  const f = (searchEl.value || "").toLowerCase();
  const all = [...SYSTEM_THEMES, ...(window.THEMES || [])];
  const grouped = {};
  for (const t of all) {
    if (f && !t.name.toLowerCase().includes(f)) continue;
    const g = t.group || "x3";
    (grouped[g] = grouped[g] || []).push(t);
  }
  for (const g of Object.keys(grouped)) {
    const head = document.createElement("div");
    head.className = "themes-group";
    head.textContent = g;
    listEl.appendChild(head);
    for (const t of grouped[g]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-item" + (state.themeId === t.id ? " active" : "");
      const face = t.colors ? t.colors.face : "#e7e9ec";
      const accent = t.colors ? t.colors.accent : "#1e6fd9";
      const ink = t.colors ? t.colors.ink : "#10121a";
      const name = document.createElement("span");
      name.className = "theme-name";
      name.textContent = t.name;
      const sw = document.createElement("span");
      sw.className = "theme-swatches";
      for (const col of [face, accent, ink]) {
        const i = document.createElement("i");
        i.style.background = col;
        sw.appendChild(i);
      }
      btn.append(name, sw);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        applyTheme(t.id);
        refreshThemeLists();
      });
      listEl.appendChild(btn);
    }
  }
}

function refreshThemeLists() {
  renderThemesList(el.themesList, el.themesSearch);
}

function applyScramble(moves) {
  el.scramble.textContent = moves;
  el.scramble.classList.remove("scramble-empty");
  setCubeAlg(moves);
  applyCubeColors();
  fitScramble();
}

async function generateScramble() {
  const fallback = generateFallbackScramble();
  try {
    const mod = await import("https://cdn.cubing.net/v0/js/cubing/scramble");
    const scramble = await mod.randomScrambleForEvent(state.event);
    return scramble.toString();
  } catch (err) {
    return fallback;
  }
}

let scramblePrefetch = 0;

async function prefetchScramble() {
  const gen = ++scramblePrefetch;
  const moves = await generateScramble();
  if (gen === scramblePrefetch && moves) {
    state.pendingScramble = moves;
  }
}

function applyNextScramble(moves) {
  state.scrambleList = state.scrambleList.slice(0, state.scrambleIndex + 1);
  state.scrambleList.push(moves);
  state.scrambleIndex = state.scrambleList.length - 1;
  applyScramble(moves);
  prefetchScramble();
}

function nextScramble() {
  const ready = state.pendingScramble;
  state.pendingScramble = null;
  if (ready) {
    applyNextScramble(ready);
    return;
  }
  const fallback = generateFallbackScramble();
  applyNextScramble(fallback);
  generateScramble().then((moves) => {
    if (moves && moves !== fallback) {
      state.scrambleList[state.scrambleIndex] = moves;
      applyScramble(moves);
    }
  });
}

function prevScramble() {
  if (state.scrambleIndex > 0) {
    state.scrambleIndex--;
    applyScramble(state.scrambleList[state.scrambleIndex]);
  }
}

/* ---------- sessions ---------- */

function newestSession(sessions) {
  return sessions.reduce(
    (a, s) => (!a || (s.created_at || "").localeCompare(a.created_at) > 0 ? s : a),
    null
  );
}

async function loadSessionsForEvent() {
  const all = await store.listSessions();
  state.sessions = all.filter((s) => s.event === state.event);
  if (state.sessions.length === 0) {
    const created = await store.createSession({ name: "Session 1", event: state.event });
    state.sessions = [created];
  }
  renderSessionList();
  let saved = null;
  try {
    saved = localStorage.getItem(SESSION_KEY);
  } catch (err) {
    /* ignore */
  }
  const target =
    state.sessions.find((s) => s.id === saved) ||
    newestSession(state.sessions) ||
    state.sessions[0];
  await loadSession(target.id);
}

function renderSessionList() {
  el.sessionPop.innerHTML = "";
  const newest = newestSession(state.sessions);
  for (const s of state.sessions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "session-item" + (s.id === state.sessionId ? " active" : "");
    btn.dataset.id = s.id;
    const name = document.createElement("span");
    name.textContent = s.name;
    const count = document.createElement("span");
    count.className = "session-count";
    count.textContent = String(s.solve_count);
    btn.append(name, count);
    if (newest && s.id === newest.id) {
      const tag = document.createElement("span");
      tag.className = "session-tag";
      tag.textContent = "recent";
      btn.appendChild(tag);
    }
    btn.addEventListener("click", () => {
      el.sessionPop.hidden = true;
      loadSession(s.id);
    });
    el.sessionPop.appendChild(btn);
  }
  const current = state.sessions.find((s) => s.id === state.sessionId);
  el.sessionBtn.textContent = current ? current.name : "session";
}

function renderEventList() {
  el.eventPop.innerHTML = "";
  for (const ev of EVENTS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "session-item" + (ev.id === state.event ? " active" : "");
    btn.textContent = ev.name;
    btn.addEventListener("click", () => {
      el.eventPop.hidden = true;
      switchEvent(ev.id);
    });
    el.eventPop.appendChild(btn);
  }
  const cur = EVENTS.find((e) => e.id === state.event);
  el.eventBtn.textContent = cur ? cur.name : "3x3";
}

async function switchEvent(id) {
  if (id === state.event) return;
  state.event = id;
  try {
    localStorage.setItem("x3.event", id);
  } catch (err) {
    /* ignore */
  }
  state.scrambleList = [];
  state.scrambleIndex = -1;
  const ev = EVENTS.find((e) => e.id === id);
  if (ev) {
    try {
      el.cube.puzzle = ev.puzzle;
      el.cube.setAttribute("puzzle", ev.puzzle);
    } catch (err) {
      /* ignore */
    }
  }
  applyEventScale();
  renderEventList();
  await loadSessionsForEvent();
  await nextScramble();
}

async function loadSession(id) {
  state.sessionId = id;
  try {
    localStorage.setItem(SESSION_KEY, String(id));
  } catch (err) {
    /* ignore */
  }
  state.solves = await store.listSolves(id);
  state.rollups = buildRollups(state.solves);
  const session = computeSession();
  renderStats(session);
  renderSolves();
  renderSparkline();
  renderSessionList();
}

async function createSession() {
  const n = state.sessions.length + 1;
  const created = await store.createSession({ name: `Session ${n}`, event: state.event });
  await loadSessionsForEvent();
  await loadSession(created.id);
}

/* ---------- rendering ---------- */

/* ---------- rolling averages (csTimer-style) ---------- */

function rolling(solves, n, trim) {
  if (solves.length < n) return null;
  const win = solves.slice(-n);
  const dnf = win.filter((s) => s.penalty === "DNF").length;
  const dnfLimit = trim ? 2 : 1;
  if (dnf >= dnfLimit) return "DNF";
  let vals = win
    .filter((s) => s.penalty !== "DNF")
    .map((s) => s.adjusted_ms)
    .sort((a, b) => a - b);
  if (trim) vals = dnf === 1 ? vals.slice(1) : vals.slice(1, -1);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function buildRollups(solves) {
  return solves.map((_, end) => {
    const w = solves.slice(0, end + 1);
    return {
      mo3: rolling(w, 3, false),
      ao5: rolling(w, 5, true),
      ao12: rolling(w, 12, true),
      ao100: rolling(w, 100, true),
    };
  });
}

function computeSession() {
  const solves = state.solves;
  const rollups = buildRollups(solves);
  const valid = solves.filter((s) => s.penalty !== "DNF");
  const vals = valid.map((s) => s.adjusted_ms);
  const bestOf = (k) => {
    let best = null;
    for (const r of rollups) {
      const v = r[k];
      if (v === null || v === "DNF") continue;
      if (best === null || v < best) best = v;
    }
    return best;
  };
  const last = rollups[rollups.length - 1] || {};
  return {
    count: solves.length,
    mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    bestTime: vals.length ? Math.min(...vals) : null,
    current: {
      time: solves.length ? solves[solves.length - 1] : null,
      mo3: last.mo3 ?? null,
      ao5: last.ao5 ?? null,
      ao12: last.ao12 ?? null,
      ao100: last.ao100 ?? null,
    },
    best: {
      time: vals.length ? Math.min(...vals) : null,
      mo3: bestOf("mo3"),
      ao5: bestOf("ao5"),
      ao12: bestOf("ao12"),
      ao100: bestOf("ao100"),
    },
    rollups,
  };
}

function fmtAvg(v) {
  if (v === null || v === undefined) return "—";
  if (v === "DNF") return "DNF";
  return formatTime(Math.round(v), 2);
}

function fmtTimeMs(ms) {
  return ms === null || ms === undefined ? "—" : formatTime(Math.round(ms), 2);
}

function renderStats(session) {
  const set = (id, el, text, dnf) => {
    el.textContent = text;
    el.classList.toggle("dnf", dnf);
  };
  const curTime = session.current.time;
  set(statEl.curTime, statEl.curTime, curTime ? formatSolveTime(curTime) : "—", curTime && curTime.penalty === "DNF");
  set(statEl.curMo3, statEl.curMo3, fmtAvg(session.current.mo3), session.current.mo3 === "DNF");
  set(statEl.curAo5, statEl.curAo5, fmtAvg(session.current.ao5), session.current.ao5 === "DNF");
  set(statEl.curAo12, statEl.curAo12, fmtAvg(session.current.ao12), session.current.ao12 === "DNF");
  set(statEl.bestTime, statEl.bestTime, fmtTimeMs(session.bestTime), false);
  set(statEl.bestMo3, statEl.bestMo3, fmtAvg(session.best.mo3), session.best.mo3 === "DNF");
  set(statEl.bestAo5, statEl.bestAo5, fmtAvg(session.best.ao5), session.best.ao5 === "DNF");
  set(statEl.bestAo12, statEl.bestAo12, fmtAvg(session.best.ao12), session.best.ao12 === "DNF");
}

function renderSolves() {
  el.solveList.innerHTML = "";
  if (state.solves.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "no solves yet — hold space to start";
    el.solveList.appendChild(li);
    return;
  }
  const rollups = state.rollups;
  const bestMs = Math.min(
    ...state.solves.map((s) => (s.penalty === "DNF" ? Infinity : s.adjusted_ms))
  );
  const bestAo5 = Math.min(
    ...rollups.map((r) => (r.ao5 === "DNF" || r.ao5 === null ? Infinity : r.ao5))
  );
  const bestAo12 = Math.min(
    ...rollups.map((r) => (r.ao12 === "DNF" || r.ao12 === null ? Infinity : r.ao12))
  );
  [...state.solves].reverse().forEach((solve, i) => {
    const chronIdx = state.solves.length - 1 - i;
    const li = document.createElement("li");
    li.className = "solve-row";
    li.tabIndex = 0;
    li.title = "view solve";
    if (solve.penalty !== "DNF" && solve.adjusted_ms === bestMs) {
      li.classList.add("solve-best");
    }
    li.addEventListener("click", () => openModal(solve.id));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(solve.id);
      }
    });

    const idx = document.createElement("span");
    idx.className = "solve-index";
    idx.textContent = String(state.solves.length - i);

    const time = document.createElement("span");
    time.className = `solve-time ${penaltyClass(solve.penalty)}`;
    const timeText = document.createElement("span");
    timeText.textContent = formatSolveTime(solve);
    time.appendChild(timeText);
    if (isAbnormalFastSolve(solve)) {
      const fast = document.createElement("span");
      fast.className = "solve-fast";
      fast.textContent = "⚡";
      fast.title = "suspiciously fast";
      time.appendChild(fast);
    }

    const r = rollups[chronIdx];
    const mk = (v, best) => {
      const cell = document.createElement("span");
      cell.className = "solve-cell";
      cell.textContent = fmtAvg(v);
      if (v === "DNF") cell.classList.add("dnf");
      if (best !== null && v !== "DNF" && v !== null && Math.round(v) === Math.round(best)) {
        cell.classList.add("best");
      }
      return cell;
    };

    li.append(idx, time, mk(r.ao5, bestAo5), mk(r.ao12, bestAo12));
    el.solveList.appendChild(li);
  });
}

function renderSparkline() {
  const values = state.solves.map((s) =>
    s.penalty === "DNF" ? null : s.adjusted_ms
  );
  const nonNull = values.filter((v) => v !== null);
  const show = nonNull.length >= 2;
  el.sparklineBest.classList.toggle("hidden", !show);
  el.sparklineWorst.classList.toggle("hidden", !show);
  el.sparkEmpty.hidden = show;
  if (!show) {
    el.sparklinePath.setAttribute("d", "");
    return;
  }
  const min = Math.min(...nonNull);
  const max = Math.max(...nonNull);
  const range = max - min || 1;
  const W = 320;
  const H = 44;
  const pad = 2;
  const x = (i) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v) => pad + (1 - (v - min) / range) * (H - pad * 2);

  let d = "";
  let started = false;
  values.forEach((v, i) => {
    if (v === null) {
      started = false;
      return;
    }
    d += `${started ? " L" : " M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    started = true;
  });
  el.sparklinePath.setAttribute("d", d);

  const bestVal = Math.min(...nonNull);
  const worstVal = Math.max(...nonNull);
  const bestIdx = values.indexOf(bestVal);
  const worstIdx = values.lastIndexOf(worstVal);
  el.sparklineBest.setAttribute("cx", x(bestIdx));
  el.sparklineBest.setAttribute("cy", y(bestVal));
  el.sparklineWorst.setAttribute("cx", x(worstIdx));
  el.sparklineWorst.setAttribute("cy", y(worstVal));
}

function findSolve(id) {
  return state.solves.find((s) => s.id === id);
}

async function patchPenalty(solve, penalty) {
  const next = solve.penalty === penalty ? "NONE" : penalty;
  const updated = await store.patchSolve(solve.id, next);
  const found = findSolve(solve.id);
  if (found) {
    found.penalty = updated.penalty;
    found.adjusted_ms = updated.adjusted_ms;
  }
  await loadSession(state.sessionId);
}

async function deleteSolve(target) {
  const id = target.id || target;
  await store.deleteSolve(id);
  await loadSession(state.sessionId);
}

/* ---------- modal ---------- */

function solveNumber(id) {
  const pos = state.solves.findIndex((s) => s.id === id);
  if (pos === -1) return "";
  return String(pos + 1).padStart(2, "0");
}

function openModal(id) {
  state.activeSolveId = id;
  renderModal();
  el.modal.hidden = false;
}

function closeModal() {
  el.modal.hidden = true;
  state.activeSolveId = null;
}

function renderModal() {
  const solve = findSolve(state.activeSolveId);
  if (!solve) return;
  el.modalTitle.textContent = `solve · #${solveNumber(solve.id)}`;
  el.modalTime.textContent = formatSolveTime(solve);
  el.modalTime.className = `modal-time ${penaltyClass(solve.penalty)}`;
  const fast = isAbnormalFastSolve(solve);
  el.modalTime.classList.toggle("fast", fast);
  el.modalTime.title = fast ? "suspiciously fast" : "";
  el.modalScramble.textContent = solve.scramble;
  el.modalScramble.title = solve.scramble;
  el.modalPlusTwo.classList.toggle("active", solve.penalty === "PLUS_TWO");
  el.modalDnf.classList.toggle("active", solve.penalty === "DNF");

  const stamp = formatStamp(solve.solved_at);
  const ago = timeAgo(solve.solved_at);
  el.metaSolved.textContent = stamp ? `${stamp} · ${ago}` : "—";

  const rank = solveRank(solve);
  el.metaRank.textContent = rank ? `${rank.rank} of ${rank.of}` : "—";

  const mean = sessionMean();
  const dev = el.metaDeviation;
  if (mean === null || solve.penalty === "DNF") {
    dev.textContent = "—";
    dev.className = "";
  } else {
    const diff = solve.adjusted_ms - mean;
    const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
    dev.textContent = `${sign}${formatTime(Math.abs(Math.round(diff)))}`;
    dev.className = diff > 0 ? "dev-slow" : "dev-fast";
  }

  const moves = solve.scramble.trim().split(/\s+/).filter(Boolean).length;
  el.metaMoves.textContent = String(moves);
  el.metaSession.textContent = sessionName(state.sessionId) || "—";

  const idx = state.solves.findIndex((s) => s.id === solve.id);
  const r = idx >= 0 && state.rollups[idx] ? state.rollups[idx] : {};
  el.modalMo3.textContent = `mo3 ${fmtAvg(r.mo3)}`;
  el.modalAo5.textContent = `ao5 ${fmtAvg(r.ao5)}`;
  el.modalAo12.textContent = `ao12 ${fmtAvg(r.ao12)}`;
  el.rollupPop.hidden = true;
  Object.values(ROLLUP_BTNS).forEach((b) => b.removeAttribute("data-active"));
  rollupOpen = null;
}

function rollupBreakdown(n, trim) {
  const solve = findSolve(state.activeSolveId);
  const idx = state.solves.findIndex((s) => s.id === solve.id);
  if (idx < 0) return null;
  const win = state.solves.slice(0, idx + 1).slice(-n);
  if (win.length < n) {
    return { win, dropped: new Set(), avg: null };
  }
  const dnf = win.filter((s) => s.penalty === "DNF").length;
  const dnfLimit = trim ? 2 : 1;
  const avg = dnf >= dnfLimit ? "DNF" : rolling(state.solves.slice(0, idx + 1), n, trim);
  const dropped = new Set();
  if (trim && dnf < dnfLimit) {
    const nonDnf = win
      .map((s, i) => ({ i, ms: s.adjusted_ms }))
      .filter((x) => win[x.i].penalty !== "DNF")
      .sort((a, b) => a.ms - b.ms);
    if (dnf === 1) {
      if (nonDnf.length) dropped.add(nonDnf[0].i);
      win.forEach((s, i) => {
        if (s.penalty === "DNF") dropped.add(i);
      });
    } else if (nonDnf.length >= 2) {
      dropped.add(nonDnf[0].i);
      dropped.add(nonDnf[nonDnf.length - 1].i);
    }
  }
  return { win, dropped, avg };
}

function renderRollup(n, trim) {
  const b = rollupBreakdown(n, trim);
  if (!b) return;
  const label = `ao${n}`;
  el.rollupTitle.textContent =
    b.avg === null || b.avg === undefined
      ? `current ${label}`
      : `current ${label} · ${b.avg === "DNF" ? "DNF" : formatTime(Math.round(b.avg), 2)}`;
  el.rollupList.innerHTML = "";
  b.win.forEach((s, i) => {
    const li = document.createElement("li");
    if (b.dropped.has(i)) li.classList.add("rollup-drop");
    const num = document.createElement("span");
    num.className = "rollup-num";
    num.textContent = String(state.solves.indexOf(s) + 1);
    const t = document.createElement("span");
    t.className = "rollup-time" + (s.penalty === "DNF" ? " dnf" : "");
    t.textContent = formatSolveTime(s);
    li.append(num, t);
    if (b.dropped.has(i)) {
      const tag = document.createElement("span");
      tag.className = "rollup-tag";
      tag.textContent = "drop";
      li.appendChild(tag);
    }
    el.rollupList.appendChild(li);
  });
}

let rollupOpen = null;
const ROLLUP_BTNS = { 3: el.modalMo3, 5: el.modalAo5, 12: el.modalAo12 };

function toggleRollup(n, trim) {
  if (rollupOpen === n) {
    el.rollupPop.hidden = true;
    rollupOpen = null;
    Object.values(ROLLUP_BTNS).forEach((b) => b.removeAttribute("data-active"));
    return;
  }
  renderRollup(n, trim);
  el.rollupPop.hidden = false;
  rollupOpen = n;
  Object.entries(ROLLUP_BTNS).forEach(([k, b]) =>
    b.setAttribute("data-active", k === String(n) ? "true" : "false")
  );
}

el.modalMo3.addEventListener("click", () => toggleRollup(3, false));
el.modalAo5.addEventListener("click", () => toggleRollup(5, true));
el.modalAo12.addEventListener("click", () => toggleRollup(12, true));

async function onModalPenalty(penalty) {
  const solve = findSolve(state.activeSolveId);
  if (!solve) return;
  await patchPenalty(solve, penalty);
  renderModal();
}

async function onModalDelete() {
  const solve = findSolve(state.activeSolveId);
  if (!solve) return;
  closeModal();
  await deleteSolve(solve);
}

/* ---------- penalty bar ---------- */

function showPenaltyBar(solveId) {
  state.lastSolveId = solveId;
  el.penaltyBar.hidden = false;
}

async function onBarPenalty(penalty) {
  if (state.lastSolveId == null) return;
  const solve = findSolve(state.lastSolveId);
  if (!solve) return;
  await patchPenalty(solve, penalty);
  el.penaltyBar.hidden = true;
}

/* ---------- timer ---------- */

function setHint(text) {
  el.hint.innerHTML = text;
}

function tickReadout(ms) {
  el.readout.textContent = formatTime(ms, 2);
}

function animateTick() {
  el.readout.classList.remove("tick");
  void el.readout.offsetWidth;
  el.readout.classList.add("tick");
}

function phase(next) {
  state.phase = next;
  el.instrument.classList.remove("armed", "running", "flash-ok", "flash-bad");
  if (next === "armed") {
    el.instrument.classList.add("armed");
    setHint("release to start");
  } else if (next === "running") {
    el.instrument.classList.add("running");
    setHint("press to stop");
  } else {
    setHint(IDLE_HINT);
  }
}

function holdStart() {
  if (state.phase !== "idle") return;
  state.holding = true;
  el.penaltyBar.hidden = true;
  state.holdTimer = setTimeout(() => {
    if (state.holding) phase("armed");
  }, ARMED_MS);
}

function holdCancel() {
  state.holding = false;
  clearTimeout(state.holdTimer);
  if (state.phase === "armed") phase("idle");
}

function cancelRun() {
  if (state.phase !== "running" && state.phase !== "armed") return;
  cancelAnimationFrame(state.raf);
  state.elapsedMs = 0;
  phase("idle");
  tickReadout(0);
  setHint("solve discarded · same scramble");
  setTimeout(() => {
    if (state.phase === "idle") phase("idle");
  }, 1400);
}

function startRun() {
  clearTimeout(state.holdTimer);
  if (state.phase !== "armed") return;
  state.startMs = performance.now();
  state.elapsedMs = 0;
  phase("running");
  if (!state.pendingScramble) prefetchScramble();
  const step = () => {
    if (state.phase !== "running") return;
    state.elapsedMs = performance.now() - state.startMs;
    tickReadout(state.elapsedMs);
    state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
}

async function stopRun(penalty = "NONE") {
  if (state.phase !== "running") return;
  cancelAnimationFrame(state.raf);
  const elapsed = state.elapsedMs;
  const beforeBests = penalty === "DNF" ? null : sessionBests(state.solves);
  phase("stopping");
  animateTick();
  try {
    const saved = await store.createSolve({
      session_id: state.sessionId,
      scramble: el.scramble.textContent,
      time_ms: Math.max(1, Math.round(elapsed)),
      penalty,
    });
    await nextScramble();
    if (penalty === "DNF") {
      el.instrument.classList.add("flash-dnf");
      setTimeout(() => el.instrument.classList.remove("flash-dnf"), 500);
    } else {
      el.instrument.classList.add("flash-ok");
      setTimeout(() => el.instrument.classList.remove("flash-ok"), 260);
    }
    await loadSession(state.sessionId);
    if (beforeBests) {
      const afterBests = sessionBests(state.solves);
      const records = [];
      for (const k of ["time", "mo3", "ao5", "ao12", "ao100"]) {
        const a = afterBests[k];
        const b = beforeBests[k];
        if (a !== null && (b === null || a < b)) records.push({ type: k, value: a });
      }
      if (records.length) {
        rememberRecord(records);
        if (window.celebrate) window.celebrate(records);
      }
    }
    showPenaltyBar(saved.id);
    if (penalty !== "DNF" && isAbnormalSolve(saved.id)) {
      await confirmUnusualSolve(saved.id);
    }
  } catch (err) {
    el.instrument.classList.add("flash-bad");
    setHint("failed to save — " + err.message);
    setTimeout(() => {
      if (state.phase === "idle") phase("idle");
    }, 900);
    nextScramble();
    return;
  }
  phase("idle");
  if (penalty === "DNF") {
    setHint("recorded as DNF");
    setTimeout(() => {
      if (state.phase === "idle") phase("idle");
    }, 1500);
  }
}

const RECORD_KEY = "x3.lastRecord";
const REC_LABELS = { time: "PB", mo3: "mo3", ao5: "ao5", ao12: "ao12", ao100: "ao100" };

function rememberRecord(records) {
  try {
    localStorage.setItem(
      RECORD_KEY,
      JSON.stringify(records.map((r) => ({ type: r.type, value: r.value })))
    );
  } catch (err) {
    /* ignore */
  }
  renderRecordCard(records);
}

function renderRecordCard(records) {
  let card = document.getElementById("record-card");
  if (!card) {
    card = document.createElement("div");
    card.id = "record-card";
    card.className = "record-card";
    document.body.appendChild(card);
    const title = document.createElement("div");
    title.className = "record-card-title";
    title.textContent = "last record";
    const body = document.createElement("div");
    body.className = "record-card-body";
    const dismiss = document.createElement("button");
    dismiss.className = "record-card-dismiss";
    dismiss.textContent = "✕";
    dismiss.title = "dismiss";
    dismiss.addEventListener("click", () => {
      try {
        localStorage.removeItem(RECORD_KEY);
      } catch (err) {
        /* ignore */
      }
      card.remove();
    });
    card.append(title, body, dismiss);
  }
  const body = card.querySelector(".record-card-body");
  body.innerHTML = "";
  for (const r of records) {
    const row = document.createElement("div");
    const label = document.createElement("span");
    label.className = "rec-label";
    label.textContent = REC_LABELS[r.type] || r.type;
    const value = document.createElement("span");
    value.className = "rec-value";
    value.textContent = formatTime(Math.round(r.value));
    row.append(label, value);
    body.appendChild(row);
  }
  card.classList.add("show");
}

function initRecordCard() {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (raw) {
      const records = JSON.parse(raw);
      if (records && records.length) renderRecordCard(records);
    }
  } catch (err) {
    /* ignore */
  }
}

function sessionBests(solves) {  const valid = solves.filter((s) => s.penalty !== "DNF").map((s) => s.adjusted_ms);
  const rollups = buildRollups(solves);
  const bestRoll = (k) => {
    let best = null;
    for (const r of rollups) {
      const v = r[k];
      if (v === null || v === "DNF") continue;
      if (best === null || v < best) best = v;
    }
    return best;
  };
  return {
    time: valid.length ? Math.min(...valid) : null,
    mo3: bestRoll("mo3"),
    ao5: bestRoll("ao5"),
    ao12: bestRoll("ao12"),
    ao100: bestRoll("ao100"),
  };
}

function isAbnormalSolve(solveId) {
  const solve = findSolve(solveId);
  if (!solve || solve.penalty === "DNF") return false;
  const valid = state.solves
    .filter((s) => s.penalty !== "DNF" && s.id !== solveId)
    .map((s) => s.adjusted_ms);
  if (valid.length < 5) return false;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const sd = Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length) || 1;
  return solve.adjusted_ms > mean + 2.5 * sd;
}

function isAbnormalFastSolve(solve) {
  if (!solve || solve.penalty === "DNF") return false;
  const valid = state.solves
    .filter((s) => s.penalty !== "DNF" && s.id !== solve.id)
    .map((s) => s.adjusted_ms);
  if (valid.length < 8) return false;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const sd = Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length) || 1;
  return solve.adjusted_ms < mean - 2.5 * sd;
}

function confirmUnusualSolve(solveId) {
  const solve = findSolve(solveId);
  const valid = state.solves
    .filter((s) => s.penalty !== "DNF" && s.id !== solveId)
    .map((s) => s.adjusted_ms);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  el.confirmTime.textContent = formatSolveTime(solve);
  el.confirmTime.className = "modal-time";
  el.confirmText.textContent = `${formatTime(Math.round(solve.adjusted_ms), 2)} is well above your ~${formatTime(
    Math.round(mean),
    2
  )} average. Was that solve right?`;
  el.confirmModal.hidden = false;
  return new Promise((resolve) => {
    el.confirmKeep.onclick = () => {
      el.confirmModal.hidden = true;
      resolve();
    };
    el.confirmRedo.onclick = async () => {
      el.confirmModal.hidden = true;
      el.penaltyBar.hidden = true;
      await deleteSolve(solveId);
      resolve();
    };
  });
}

/* ---------- input ---------- */

function handleKey(e) {
  if (e.code === "Escape") {
    if (!el.confirmModal.hidden) {
      el.confirmKeep.click();
      return;
    }
    if (!el.modal.hidden) {
      closeModal();
      return;
    }
    if (el.drawer.classList.contains("open")) {
      setDrawer(false);
      return;
    }
    const anyPop = [el.themesPop, el.settingsPop, el.profilePop].some(
      (p) => p && !p.hidden
    );
    if (anyPop) {
      closeOtherPops(null);
      return;
    }
    cancelRun();
    return;
  }
  if (e.code !== "Space") return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  e.preventDefault();
  if (e.type === "keydown" && !e.repeat) {
    if (state.phase === "running") {
      stopRun();
    } else {
      holdStart();
    }
  } else if (e.type === "keyup") {
    if (state.phase === "running") return;
    if (state.phase === "armed") {
      startRun();
    }
    state.holding = false;
    clearTimeout(state.holdTimer);
  }
}

function handlePointer(e) {
  const target = e.target;
  if (
    target.closest &&
    (target.closest("button") ||
      target.closest("select") ||
      target.closest(".badge") ||
      target.closest(".cube"))
  ) {
    return;
  }
  if (e.type === "pointerdown") {
    if (state.phase === "running") {
      stopRun();
    } else {
      holdStart();
    }
  } else if (e.type === "pointerup") {
    if (state.phase === "armed") {
      startRun();
    }
    state.holding = false;
    clearTimeout(state.holdTimer);
  } else if (e.type === "pointerleave") {
    holdCancel();
  }
}

/* ---------- wiring ---------- */

document.addEventListener("keydown", handleKey);
document.addEventListener("keyup", handleKey);
window.addEventListener("blur", holdCancel);
el.instrument.addEventListener("pointerdown", handlePointer);
el.instrument.addEventListener("pointerup", handlePointer);
el.instrument.addEventListener("pointerleave", handlePointer);
el.instrument.addEventListener("contextmenu", (e) => e.preventDefault());

el.sessionBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeOtherPops(el.sessionPop);
  el.sessionPop.hidden = !el.sessionPop.hidden;
});
el.eventBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeOtherPops(el.eventPop);
  el.eventPop.hidden = !el.eventPop.hidden;
});
el.newSession.addEventListener("click", createSession);
document.addEventListener("click", (e) => {
  if (!el.sessionPop.hidden && !e.target.closest(".session-picker")) {
    el.sessionPop.hidden = true;
  }
  if (!el.eventPop.hidden && !e.target.closest(".event-picker")) {
    el.eventPop.hidden = true;
  }
  if (!el.themesPop.hidden && !e.target.closest(".themes-wrap")) {
    el.themesPop.hidden = true;
  }
  if (!el.settingsPop.hidden && !e.target.closest(".settings-wrap")) {
    el.settingsPop.hidden = true;
  }
  if (!el.profilePop.hidden && !e.target.closest(".profile-wrap")) {
    el.profilePop.hidden = true;
  }
  updatePopAria();
});

function updatePopAria() {
  const pairs = [
    [el.themesBtn, el.themesPop],
    [el.settingsBtn, el.settingsPop],
    [el.profileBtn, el.profilePop],
  ];
  for (const [btn, pop] of pairs) {
    if (btn && pop) btn.setAttribute("aria-expanded", pop.hidden ? "false" : "true");
  }
}

function closeOtherPops(keep) {
  const pops = [el.themesPop, el.settingsPop, el.sessionPop, el.eventPop, el.profilePop];
  pops.forEach((p) => {
    if (p && p !== keep) p.hidden = true;
  });
  updatePopAria();
}

function setDrawer(open) {
  el.drawer.classList.toggle("open", open);
  el.menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}
el.menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = !el.drawer.classList.contains("open");
  if (open) closeOtherPops(null);
  setDrawer(open);
});
el.drawerClose.addEventListener("click", () => setDrawer(false));

const HISTORY_KEY = "x3.historyCollapsed";

function setHistoryCollapsed(collapsed) {
  document.body.classList.toggle("history-collapsed", collapsed);
  el.historyToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  try {
    localStorage.setItem(HISTORY_KEY, collapsed ? "1" : "0");
  } catch (err) {
    /* ignore */
  }
}

el.historyToggle.addEventListener("click", () => {
  setHistoryCollapsed(!document.body.classList.contains("history-collapsed"));
});

function initHistoryToggle() {
  if (!el.historyToggle) return;
  let saved = null;
  try {
    saved = localStorage.getItem(HISTORY_KEY);
  } catch (err) {
    /* ignore */
  }
  setHistoryCollapsed(saved === "0" ? false : true);
}

window.addEventListener("resize", () => {
  fitScramble();
  if (window.innerWidth > 700) setDrawer(false);
});

el.themesBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeOtherPops(el.themesPop);
  el.themesPop.hidden = !el.themesPop.hidden;
  if (!el.themesPop.hidden) renderThemesList(el.themesList, el.themesSearch);
  updatePopAria();
});
el.themesSearch.addEventListener("input", () => renderThemesList(el.themesList, el.themesSearch));

el.settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeOtherPops(el.settingsPop);
  el.settingsPop.hidden = !el.settingsPop.hidden;
  updatePopAria();
});

el.nextScramble = document.getElementById("next-scramble");
el.prevScramble = document.getElementById("prev-scramble");
el.nextScramble.addEventListener("click", () => nextScramble());
el.prevScramble.addEventListener("click", prevScramble);

el.penaltyBar.querySelectorAll(".penalty-btn").forEach((btn) => {
  btn.addEventListener("click", () => onBarPenalty(btn.dataset.penalty));
});

el.modal.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", closeModal);
});
el.modalPlusTwo.addEventListener("click", () => onModalPenalty("PLUS_TWO"));
el.modalDnf.addEventListener("click", () => onModalPenalty("DNF"));
el.modalDelete.addEventListener("click", onModalDelete);

el.confirmModal.querySelectorAll("[data-close-confirm]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!el.confirmModal.hidden) el.confirmKeep.click();
  });
});

async function init() {
  try {
    const savedEvent = localStorage.getItem("x3.event");
    if (savedEvent && EVENTS.some((e) => e.id === savedEvent)) {
      state.event = savedEvent;
    }
  } catch (err) {
    /* ignore */
  }
  await auth.init();
  renderAuth();
  tickReadout(0);
  initSettings();
  initTheme();
  initHistoryToggle();
  initRecordCard();
  refreshThemeLists();
  const ev = EVENTS.find((e) => e.id === state.event);
  if (ev) {
    try {
      el.cube.puzzle = ev.puzzle;
      el.cube.setAttribute("puzzle", ev.puzzle);
    } catch (err) {
      /* ignore */
    }
  }
  applyEventScale();
  renderEventList();
  await loadSessionsForEvent();
  await nextScramble();
}

function setAvatar(container, src) {
  if (!container) return;
  if (!src) {
    container.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    return;
  }
  const img = document.createElement("img");
  img.className = "profile-avatar-img";
  img.src = src;
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.draggable = false;
  img.onerror = () => setAvatar(container, "");
  container.innerHTML = "";
  container.appendChild(img);
}

function renderAuth() {
  const signedIn = auth.isSignedIn();
  const u = auth.getUser();
  el.signInBtn.hidden = signedIn;
  el.profileWrap.hidden = !signedIn;
  if (!signedIn) {
    closeOtherPops(null);
    return;
  }
  const name = (u && (u.name || u.email)) || "signed in";
  el.profilePopName.textContent = name;
  if (u && u.email && u.name && u.name !== u.email) {
    el.profileEmail.hidden = false;
    el.profileEmail.textContent = u.email;
  } else {
    el.profileEmail.hidden = true;
  }
  const picture = (u && u.picture) || "";
  setAvatar(el.profileAvatar, picture);
  setAvatar(el.profilePopAvatar, picture);
}

el.signInBtn.addEventListener("click", () => auth.login());
el.profileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closeOtherPops(el.profilePop);
  el.profilePop.hidden = !el.profilePop.hidden;
  updatePopAria();
});
el.signOutBtn.addEventListener("click", async () => {
  await auth.signOut();
  window.location.reload();
});

init().catch((err) => {
  el.hint.textContent = "failed to load — " + err.message;
});
