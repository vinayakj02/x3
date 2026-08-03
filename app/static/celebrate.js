(function () {
  if (typeof document === "undefined") return;

  const PRESETS = {
    fireworks: { name: "Fireworks", colors: ["#4d8bff", "#ffd500", "#ff5a5f", "#43a371", "#d3a75f"], spawn: "burst", count: 110, life: 100, gravity: 0.045 },
    confetti: { name: "Confetti", colors: ["#4d8bff", "#ffd500", "#ff5a5f", "#43a371", "#b23a2b", "#a97c3f"], spawn: "fallRect", count: 70, life: 170, gravity: 0.03 },
    rings: { name: "Rings", colors: ["#5b93ff", "#9fd0ff"], spawn: "ring", count: 5, life: 70, gravity: 0 },
    sparkles: { name: "Sparkles", colors: ["#ffd700", "#fff6d8", "#ffe08a"], spawn: "twinkle", count: 90, life: 80, gravity: -0.001 },
    rain: { name: "Rain", colors: ["#7fb2ff", "#4d8bff"], spawn: "rain", count: 90, life: 90, gravity: 0.12 },
    streamers: { name: "Streamers", colors: ["#ffd700", "#ff7a59", "#ffffff"], spawn: "riseStreak", count: 60, life: 110, gravity: -0.05 },
    pulse: { name: "Pulse", colors: ["#22d3ee", "#5b93ff"], spawn: "ring", count: 8, life: 60, gravity: 0 },
    orbit: { name: "Orbit", colors: ["#a78bfa", "#e9d5ff"], spawn: "orbit", count: 70, life: 120, gravity: 0 },
    bounce: { name: "Bounce", colors: ["#43a371", "#8ef0b3", "#1f7a48"], spawn: "bounce", count: 40, life: 160, gravity: 0.09 },
    wave: { name: "Wave", colors: ["#2dd4bf", "#5eead4", "#99f6e4"], spawn: "wave", count: 60, life: 90, gravity: 0 },
    geyser: { name: "Geyser", colors: ["#ffa62b", "#ffd166", "#ff7a59"], spawn: "geyser", count: 70, life: 90, gravity: -0.06 },
    bloom: { name: "Bloom", colors: ["#f472b6", "#f9a8d4", "#fecdd3"], spawn: "bloom", count: 60, life: 80, gravity: 0 },
    glitch: { name: "Glitch", colors: ["#f0f", "#0ff", "#fff", "#f9a8d4"], spawn: "fallRect", count: 60, life: 60, gravity: 0.2 },
    shockwave: { name: "Shockwave", colors: ["#ffffff", "#bfe3ff", "#5b93ff"], spawn: "ring", count: 4, life: 50, gravity: 0 },
    petals: { name: "Petal Fall", colors: ["#fda4af", "#fbcfe8", "#fecdd3", "#ffe4e6"], spawn: "petal", count: 60, life: 150, gravity: 0.02 },
    neon: { name: "Neon Burst", colors: ["#22d3ee", "#a78bfa", "#f0abfc", "#4ade80"], spawn: "burst", count: 80, life: 70, gravity: 0.02 },
    stars: { name: "Star Field", colors: ["#ffffff", "#bfe3ff", "#ffd700"], spawn: "twinkle", count: 120, life: 100, gravity: 0 },
    meteor: { name: "Meteors", colors: ["#ff7a59", "#ffd166", "#ffffff"], spawn: "meteor", count: 30, life: 70, gravity: 0.06 },
    bubbles: { name: "Bubbles", colors: ["#7dd3fc", "#bae6fd", "#e0f2fe"], spawn: "bubble", count: 40, life: 140, gravity: -0.03 },
    aurora: { name: "Aurora", colors: ["#34d399", "#6ee7b7", "#67e8f9", "#a5b4fc"], spawn: "aurora", count: 90, life: 140, gravity: -0.005 },
  };

  const THEME_CELEBRATIONS = {
    "star-wars": { name: "Star Wars", spawn: "ships", colors: ["#4fd8ff", "#ffd84d", "#3dff6e"], count: 20 },
    "alien": { name: "Alien", spawn: "fallRect", colors: ["#7cfc00", "#8ae99a", "#a3b18a"], count: 60, gravity: 0.02, life: 170 },
    "blade-runner": { name: "Blade Runner", spawn: "ring", colors: ["#00e5ff", "#ff6e3a"], count: 6, life: 70 },
    "tron": { name: "Tron", spawn: "ring", colors: ["#00e5ff", "#00bfff"], count: 5, life: 60 },
    "the-matrix": { name: "Matrix", spawn: "rain", colors: ["#00ff41", "#00e05f"], count: 100, life: 90 },
    "dune": { name: "Dune", spawn: "geyser", colors: ["#f5c26b", "#e0a94e", "#b0542a"], count: 80, life: 90 },
    "interstellar": { name: "Interstellar", spawn: "wave", colors: ["#7fb2ff", "#4ade80"], count: 70, life: 90 },
    "cyberpunk-2077": { name: "Cyberpunk", spawn: "burst", colors: ["#f72585", "#ffd60a", "#3a86ff"], count: 90, life: 70 },
  };
  const SHIP_IMGS = [];
  for (const src of ["assets/star_warsSpaceship.png", "assets/star_wars_fighter.png"]) {
    const im = new Image();
    im.src = src;
    SHIP_IMGS.push(im);
  }

  const RECORD_LABELS = { time: "PB", mo3: "mo3", ao5: "ao5", ao12: "ao12", ao100: "ao100" };
  const SEL_KEY = "x3.celebration";

  function fmt(ms) {
    if (ms == null) return "";
    const s = ms / 1000;
    const m = Math.floor(s / 60);
    const frac = String(Math.round(ms % 1000)).padStart(3, "0").slice(0, 2);
    return m > 0 ? `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}.${frac}` : `${(s).toFixed(2)}`;
  }

  function injectStyles() {
    if (document.getElementById("celebrate-styles")) return;
    const style = document.createElement("style");
    style.id = "celebrate-styles";
    style.textContent = `
      #celebration-overlay{position:fixed;inset:0;z-index:90;pointer-events:none;display:flex;align-items:flex-start;justify-content:center;padding-top:48vh;}
      #celebration-canvas{position:fixed;inset:0;z-index:90;pointer-events:none;}
      #celebration-banner{position:relative;z-index:91;pointer-events:auto;font-family:'Space Grotesk',system-ui,sans-serif;background:rgba(16,18,26,.82);color:#fff;border:1px solid rgba(255,255,255,.25);padding:1rem 1.6rem 1.1rem;text-align:center;backdrop-filter:blur(6px);animation:celebrate-in .4s cubic-bezier(.2,1.4,.4,1);}
      #celebration-banner .banner-title{font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.28em;text-transform:uppercase;color:#ffd700;margin-bottom:.35rem;}
      #celebration-banner .banner-records{font-family:'Space Mono',monospace;font-variant-numeric:tabular-nums;}
      #celebration-banner .banner-records div{margin:.18rem 0;}
      #celebration-banner .banner-records .r-label{color:#ffd700;font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.14em;margin-right:.5rem;}
      #celebration-banner .banner-records .r-value{font-size:1.35rem;font-weight:700;color:#fff;}
      #celebration-banner .banner-dismiss{margin-top:.7rem;font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.2em;text-transform:uppercase;color:#9aa3b4;cursor:pointer;border:none;background:none;padding:0;}
      #celebration-banner .banner-dismiss:hover{color:#fff;}
      @keyframes celebrate-in{from{opacity:0;transform:translateY(-14px) scale(.9);}to{opacity:1;transform:none;}}
    `;
    document.head.appendChild(style);
  }

  function selectedPreset() {
    let id = "confetti";
    try { id = localStorage.getItem(SEL_KEY) || "confetti"; } catch (e) { /* ignore */ }
    if (id === "fireworks") id = "confetti";
    return PRESETS[id] ? id : "confetti";
  }

  window.x3CelebrationPresets = Object.keys(PRESETS).map((id) => ({ id, name: PRESETS[id].name, colors: PRESETS[id].colors }));

  window.celebrate = function (records) {
    if (!records || !records.length) return;
    injectStyles();
    const id = selectedPreset();
    let cfg = PRESETS[id];
    let themeId = "";
    try { themeId = localStorage.getItem("x3.theme") || ""; } catch (e) { /* ignore */ }
    if (THEME_CELEBRATIONS[themeId]) cfg = Object.assign({}, cfg, THEME_CELEBRATIONS[themeId]);

    let canvas = document.getElementById("celebration-canvas");
    let overlay = document.getElementById("celebration-overlay");
    if (canvas) { canvas.remove(); overlay.remove(); }
    canvas = document.createElement("canvas");
    canvas.id = "celebration-canvas";
    overlay = document.createElement("div");
    overlay.id = "celebration-overlay";
    document.body.appendChild(canvas);
    document.body.appendChild(overlay);

    const banner = document.createElement("div");
    banner.id = "celebration-banner";
    const hasTime = records.some((r) => r.type === "time");
    const headline = hasTime ? "new personal best" : "new record";
    banner.innerHTML = `<div class="banner-title">${cfg.name} · ${headline}</div>` +
      `<div class="banner-records">` + records.map((r) => `<div><span class="r-label">${RECORD_LABELS[r.type] || r.type}</span><span class="r-value">${fmt(r.value)}</span></div>`).join("") + `</div>` +
      `<button class="banner-dismiss">dismiss</button>`;
    overlay.appendChild(banner);
    banner.querySelector(".banner-dismiss").addEventListener("click", () => { canvas.remove(); overlay.remove(); });

    const ctx = canvas.getContext("2d");
    let W, H;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() { W = window.innerWidth; H = window.innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    const DURATION = 3200;
    let particles = [];
    let rockets = [];
    let ships = [];

    function pickColor() { return cfg.colors[Math.floor(Math.random() * cfg.colors.length)]; }

    function spawn() {
      const cx = W / 2, cy = H / 2;
      if (cfg.spawn === "ships") {
        if (ships.length < 8 && Math.random() < 0.4) {
          const fromLeft = Math.random() < 0.5;
          const img = SHIP_IMGS[Math.random() < 0.55 ? 0 : 1];
          const scale = (0.18 + Math.random() * 0.12) * (window.devicePixelRatio > 1 ? 0.8 : 1);
          ships.push({
            x: fromLeft ? -img.width * scale : W + img.width * scale,
            y: H * 0.1 + Math.random() * H * 0.72,
            vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 4),
            vy: (Math.random() - 0.5) * 0.6,
            img,
            scale,
            rot: fromLeft ? -0.06 : 0.06,
          });
        }
        return;
      }
      const n = Math.max(1, Math.round(cfg.count / 30));
      for (let i = 0; i < n; i++) {
        const c = pickColor();
        switch (cfg.spawn) {
          case "burst":
            rockets.push({ x: W * 0.1 + Math.random() * W * 0.8, y: H, vy: -(6 + Math.random() * 5), c });
            break;
          case "fallRect":
            particles.push({ x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 1.4, vy: cfg.gravity * 2 + Math.random(), shape: "rect", c, size: 6 + Math.random() * 6, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.2, life: 0, max: 40 + Math.random() * cfg.life });
            break;
          case "ring":
            particles.push({ x: cx, y: cy, vx: 0, vy: 0, shape: "ring", c, size: 6, vg: 1.8 + Math.random() * 1.5, life: 0, max: cfg.life });
            break;
          case "twinkle":
            particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, shape: "star", c, size: 1 + Math.random() * 2.4, life: 0, max: 30 + Math.random() * cfg.life, phase: Math.random() * 6.28 });
            break;
          case "rain":
            particles.push({ x: Math.random() * W, y: -20, vx: 0, vy: cfg.gravity * 8 + Math.random() * 6, shape: "streak", c, size: 18 + Math.random() * 18, life: 0, max: 90 });
            break;
          case "riseStreak":
            particles.push({ x: Math.random() * W, y: H + 20, vx: (Math.random() - 0.5) * 2, vy: -(cfg.gravity * 20 + Math.random() * 4), shape: "streak", c, size: 14 + Math.random() * 20, life: 0, max: cfg.life });
            break;
          case "orbit":
            particles.push({ x: cx, y: cy, vx: 0, vy: 0, shape: "dot", c, size: 2 + Math.random() * 2, ang: Math.random() * 6.28, rad: 30 + Math.random() * Math.min(W, H) * 0.35, spd: (0.5 + Math.random()) * (Math.random() < 0.5 ? 1 : -1), life: 0, max: cfg.life });
            break;
          case "bounce":
            particles.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 3, vy: 1, shape: "dot", c, size: 4 + Math.random() * 5, life: 0, max: cfg.life, bouncy: true });
            break;
          case "wave":
            particles.push({ x: -20, y: cy, vx: 0, vy: 0, shape: "dot", c, size: 3 + Math.random() * 3, phase: Math.random() * 6.28, life: 0, max: cfg.life, wave: true });
            break;
          case "geyser":
            particles.push({ x: cx + (Math.random() - 0.5) * W * 0.2, y: H, vx: (Math.random() - 0.5) * 4, vy: -(cfg.gravity * 30 + Math.random() * 8), shape: "dot", c, size: 3 + Math.random() * 4, life: 0, max: cfg.life });
            break;
          case "bloom":
            particles.push({ x: cx, y: cy, vx: 0, vy: 0, shape: "dot", c, size: 2 + Math.random() * 2.5, ang: Math.random() * 6.28, rad: 4, vg: 0.4 + Math.random() * 0.8, life: 0, max: cfg.life, bloom: true });
            break;
          case "petal":
            particles.push({ x: Math.random() * W, y: -20, vx: (Math.random() - 0.5) * 0.6, vy: cfg.gravity * 10 + 0.8, shape: "rect", c, size: 5 + Math.random() * 4, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.06, life: 0, max: cfg.life, sway: true, phase: Math.random() * 6.28 });
            break;
          case "meteor":
            particles.push({ x: Math.random() * W, y: -20, vx: -(2 + Math.random() * 3), vy: cfg.gravity * 12 + Math.random() * 4, shape: "streak", c, size: 30 + Math.random() * 20, life: 0, max: cfg.life });
            break;
          case "bubble":
            particles.push({ x: Math.random() * W, y: H + 20, vx: (Math.random() - 0.5) * 0.8, vy: -(cfg.gravity * 12 + 1), shape: "dot", c, size: 4 + Math.random() * 8, life: 0, max: cfg.life, sway: true, phase: Math.random() * 6.28 });
            break;
          case "aurora":
            particles.push({ x: Math.random() * W, y: H * (0.3 + Math.random() * 0.7), vx: (Math.random() - 0.5) * 0.4, vy: -0.2 - Math.random() * 0.5, shape: "streak", c, size: 20 + Math.random() * 30, life: 0, max: cfg.life, sway: true, phase: Math.random() * 6.28 });
            break;
          default:
            break;
        }
      }
    }

    function explode(r) {
      const n = 26 + Math.floor(Math.random() * 20);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
        const sp = 2 + Math.random() * 4;
        particles.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, shape: Math.random() < 0.3 ? "star" : "dot", c: r.c, size: 1.6 + Math.random() * 2, life: 0, max: 50 + Math.random() * 50, grav: cfg.gravity });
      }
    }

    function frame(now) {
      const elapsed = now - start;
      if (elapsed < DURATION) {
        spawn();
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.y += r.vy;
          ctx.strokeStyle = r.c; ctx.globalAlpha = 0.9; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r.x, r.y + 6); ctx.lineTo(r.x, r.y); ctx.stroke();
          if (r.vy > -1.2) { explode(r); rockets.splice(i, 1); }
          else r.vy += 0.06;
        }
        ctx.globalAlpha = 1;
      }

      ctx.clearRect(0, 0, W, H);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        if (p.life > p.max) { particles.splice(i, 1); continue; }
        const a = 1 - p.life / p.max;

        if (p.shape === "ring") { p.size += p.vg; ctx.globalAlpha = a * 0.6; ctx.strokeStyle = p.c; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.stroke(); continue; }
        if (p.shape === "star") { const tw = 0.5 + 0.5 * Math.sin(p.phase + p.life * 0.3); ctx.globalAlpha = a * tw; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill(); }
        else if (p.shape === "rect") { ctx.globalAlpha = a * 0.9; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); }
        else if (p.shape === "streak") { ctx.globalAlpha = a * 0.85; ctx.strokeStyle = p.c; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 4, p.y - p.vy * 4); ctx.stroke(); }
        else { ctx.globalAlpha = a; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.fill(); }

        if (p.orbit) { p.ang += p.spd * 0.03; p.x = W / 2 + Math.cos(p.ang) * p.rad; p.y = H / 2 + Math.sin(p.ang) * p.rad; }
        else if (p.wave) { p.x += 3.2; p.y = H / 2 + Math.sin(p.phase + p.x * 0.04) * H * 0.32; }
        else if (p.bloom) { p.rad += p.vg; p.x = W / 2 + Math.cos(p.ang) * p.rad; p.y = H / 2 + Math.sin(p.ang) * p.rad; }
        else if (p.bouncy) { p.vy += cfg.gravity; if (p.y > H - 10) { p.y = H - 10; p.vy *= -0.6; } p.x += p.vx; p.y += p.vy; }
        else if (p.sway) { p.x += Math.sin(p.phase + p.life * 0.05) * 1.2; p.x += p.vx; p.y += p.vy; }
        else { if (p.grav) p.vy += p.grav; p.x += p.vx; p.y += p.vy; }
      }

      for (let i = ships.length - 1; i >= 0; i--) {
        const s = ships[i];
        s.x += s.vx;
        s.y += s.vy;
        const w = s.img.width * s.scale;
        const h = s.img.height * s.scale;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.globalAlpha = 1;
        ctx.drawImage(s.img, -w / 2, -h / 2, w, h);
        ctx.restore();
        if ((s.vx > 0 && s.x - w / 2 > W) || (s.vx < 0 && s.x + w / 2 < 0)) ships.splice(i, 1);
      }

      if (elapsed < DURATION || particles.length > 0 || ships.length > 0) {
        requestAnimationFrame(frame);
      } else {
        ctx.globalAlpha = 1;
        const fade = setInterval(() => {
          canvas.style.opacity = (parseFloat(canvas.style.opacity || "1") - 0.15).toString();
          if (canvas.style.opacity <= 0) { clearInterval(fade); canvas.remove(); overlay.remove(); window.removeEventListener("resize", resize); }
        }, 60);
      }
    }
    requestAnimationFrame(frame);
    setTimeout(() => { if (canvas.isConnected) banner.style.opacity = "0"; }, 2600);
    setTimeout(() => { if (overlay.isConnected) { canvas.remove(); overlay.remove(); window.removeEventListener("resize", resize); } }, 3400);
  };
})();
