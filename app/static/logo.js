/* x3 particle-field favicon + optional brand logo (vanilla canvas, no p5) */
(function () {
  "use strict";

  const W = 88;
  const H = 30;
  const STEP = 2;
  const DOT = 1.5;
  const LERP = 0.06;

  const canvas = document.getElementById("brand-logo");
  const faviconLink = document.getElementById("favicon");
  if (!canvas && !faviconLink) return;

  const ctx = canvas ? canvas.getContext("2d") : null;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let targets = [];
  let parts = [];
  let tick = 0;
  let built = false;

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function sampleGlyph(w, h, textSize) {
    const g = document.createElement("canvas");
    g.width = w;
    g.height = h;
    const gx = g.getContext("2d");
    gx.clearRect(0, 0, w, h);
    gx.fillStyle = "#fff";
    gx.font = `700 ${textSize}px "Space Grotesk"`;
    gx.textAlign = "center";
    gx.textBaseline = "middle";
    gx.fillText("x3", w / 2, h / 2 + h * 0.02);
    return gx.getImageData(0, 0, w, h).data;
  }

  function buildTargets() {
    const data = sampleGlyph(W, H, 24);
    targets = [];
    for (let y = 0; y < H; y += STEP) {
      for (let x = 0; x < W; x += STEP) {
        if (data[(y * W + x) * 4] > 128) targets.push([x + 1, y + 1]);
      }
    }
    parts = targets.map(() => ({
      x: Math.random() * W,
      y: Math.random() * H,
    }));
    built = true;
  }

  function draw() {
    if (!ctx) return;
    ctx.fillStyle = cssVar("--face", "#e7e9ec");
    ctx.fillRect(0, 0, W, H);
    if (!built || !targets.length) return;
    ctx.fillStyle = cssVar("--ink", "#10121a");
    for (let i = 0; i < parts.length; i++) {
      const q = parts[i];
      const tg = targets[i];
      q.x += (tg[0] - q.x) * LERP;
      q.y += (tg[1] - q.y) * LERP;
      ctx.beginPath();
      ctx.arc(q.x, q.y, DOT, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop() {
    tick++;
    if (tick % 240 === 0 && targets.length > 1) {
      for (let i = targets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [targets[i], targets[j]] = [targets[j], targets[i]];
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  function refreshFavicon() {
    if (!faviconLink) return;
    const ink = cssVar("--ink", "#10121a");
    const S = 64;
    const data = sampleGlyph(S, S, 42);
    const f = document.createElement("canvas");
    f.width = S;
    f.height = S;
    const fx = f.getContext("2d");
    fx.clearRect(0, 0, S, S);
    fx.fillStyle = ink;
    for (let y = 0; y < S; y += 2) {
      for (let x = 0; x < S; x += 2) {
        if (data[(y * S + x) * 4] > 128) {
          fx.beginPath();
          fx.arc(x + 1, y + 1, 1.4, 0, Math.PI * 2);
          fx.fill();
        }
      }
    }
    faviconLink.href = f.toDataURL("image/png");
  }

  if (ctx) {
    buildTargets();
    if (reduced) {
      parts = targets.map((t) => ({ x: t[0], y: t[1] }));
      draw();
    } else {
      requestAnimationFrame(loop);
    }
  }
  if (document.fonts && document.fonts.load) {
    document.fonts
      .load('700 24px "Space Grotesk"', "x3")
      .then(() => {
        if (ctx) {
          buildTargets();
          if (reduced) {
            parts = targets.map((t) => ({ x: t[0], y: t[1] }));
            draw();
          }
        }
        refreshFavicon();
      })
      .catch(() => {});
  }
  refreshFavicon();
  window.refreshFavicon = refreshFavicon;
})();
