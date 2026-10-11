// サムネイルの描画。デザイン座標は 1280x720 を基準にして、出力サイズに合わせて拡大する。
(function () {
  const BW = 1280, BH = 720;
  const FONT_JP = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif';
  const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
  const FONT_LOGO = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  const RED = "rgba(255,70,110,.45)", CYAN = "rgba(70,210,255,.5)";

  // 人数ごとのアイコン直径
  const ICON_D = { 1: 250, 2: 232, 3: 200, 4: 168 };

  // ---- noise (seeded so every export is identical) ----
  let noiseCache = null;
  function noise(w, h) {
    if (noiseCache && noiseCache.width === w && noiseCache.height === h) return noiseCache;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const img = x.createImageData(w, h);
    let s = 20261012;
    const rnd = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rnd() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return (noiseCache = c);
  }

  // ---- tinted copies of an image (for chromatic aberration on the logo icon) ----
  const tintCache = new Map();
  function tinted(img, color) {
    const key = img.src.length + ":" + img.src.slice(-32) + color;
    if (tintCache.has(key)) return tintCache.get(key);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
    return c;
  }

  // ---- text helpers ----
  function spacedWidth(ctx, text, spacing) {
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return w; // CSS と同じく末尾にも字間が付く
  }
  function fillSpaced(ctx, text, x, y, spacing) {
    if (!spacing) { ctx.fillText(text, x, y); return; }
    let cx = x;
    for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing; }
  }

  // 白文字 + 色ズレ + ぼんやりした光
  function fxText(ctx, S, fx, draw, glow) {
    if (glow) {
      ctx.save();
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = glow.blur * S;
      ctx.shadowOffsetX = 10000 * S;
      ctx.fillStyle = "#000";
      draw(-10000);
      ctx.restore();
    }
    if (fx) {
      ctx.fillStyle = CYAN; draw(1.5);
      ctx.fillStyle = RED; draw(-1.5);
    }
    ctx.fillStyle = "#fff";
    draw(0);
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function circle(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }

  // ---- layers ----
  function background(ctx) {
    // radial-gradient(110% 80% at 50% 95%, #c9ccd5 0%, #a7acb8 45%, #8a909e 100%)
    const cx = 640, cy = 684, rx = 1408, ry = 576, k = ry / rx;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, k);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "#c9ccd5"); g.addColorStop(0.45, "#acb1bd"); g.addColorStop(1, "#9096a3");
    ctx.fillStyle = g;
    ctx.fillRect(-cx, -cy / k, BW, BH / k);
    ctx.restore();
  }
  function grain(ctx, W, H) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.045;
    ctx.drawImage(noise(W, H), 0, 0);
    ctx.restore();
  }
  function fog(ctx) {
    const cx = 640, cy = 684, rx = 768, ry = 252, k = ry / rx;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, k);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "rgba(255,255,255,.55)");
    g.addColorStop(0.7, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  function cornerTicks(ctx) {
    const c = "rgba(255,255,255,.85)", w = 1.5, o = 28.75, L = 18;
    [[o, o, 1, 1], [BW - o, o, -1, 1], [o, BH - o, 1, -1], [BW - o, BH - o, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + L * sx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + L * sy);
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "square"; ctx.stroke();
    });
  }

  function titleBlock(ctx, S, d, maxW) {
    let fs = 92;
    ctx.font = `500 ${fs}px ${FONT_JP}`;
    while (fs > 44 && ctx.measureText(d.title).width > maxW) {
      fs -= 2; ctx.font = `500 ${fs}px ${FONT_JP}`;
    }
    const base = 50 + 0.961 * fs;
    fxText(ctx, S, d.fx, (dx) => ctx.fillText(d.title, 58 + dx, base), { color: "rgba(255,255,255,.25)", blur: 18 });

    if (d.sub) {
      const top = 50 + 1.05 * fs + 14;
      ctx.font = `400 28px ${FONT_JP}`;
      fxText(ctx, S, d.fx, (dx) => {
        ctx.fillRect(58 + dx, top + 20.25 - 0.75, 36, 1.5);
        fillSpaced(ctx, d.sub, 108 + dx, top + 32.5, 28 * 0.12);
      }, { color: "rgba(255,255,255,.25)", blur: 18 });
    }
  }

  // 右上の DATE / DAY / TIME / BY。左端の x を返す（タイトルの最大幅計算用）
  function infoBlock(ctx, S, d, measureOnly) {
    const rows = [["DATE", d.dateText, false], ["DAY", d.day, false], ["TIME", d.time, false], ["BY", d.by, true]]
      .filter((r) => r[1]);
    const right = 1222;
    let minLeft = right;
    rows.forEach(([k, v, jp], i) => {
      const base = 81.9 + i * 36.75;
      ctx.font = jp ? `500 21px ${FONT_JP}` : `400 21px ${FONT_MONO}`;
      const sp = 21 * (jp ? 0.04 : 0.06);
      const vw = spacedWidth(ctx, v, sp);
      const vx = right - vw;
      ctx.font = `400 13px ${FONT_MONO}`;
      const kw = spacedWidth(ctx, k, 13 * 0.06);
      const kx = vx - 14 - kw;
      minLeft = Math.min(minLeft, kx);
      if (measureOnly) return;
      const glow = { color: "rgba(255,255,255,.25)", blur: 18 };
      ctx.save();
      ctx.globalAlpha = 0.75;
      fxText(ctx, S, d.fx, (dx) => fillSpaced(ctx, k, kx + dx, base, 13 * 0.06), glow);
      ctx.restore();
      ctx.font = jp ? `500 21px ${FONT_JP}` : `400 21px ${FONT_MONO}`;
      fxText(ctx, S, d.fx, (dx) => fillSpaced(ctx, v, vx + dx, base, sp), glow);
    });
    return minLeft;
  }

  function speakerBlock(ctx, S, d, sp, cx, cy, D) {
    const r = D / 2;
    // rings
    circle(ctx, cx, cy, r + 26 - 0.5);
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.setLineDash([3, 3]);
    circle(ctx, cx, cy, r + 14 - 0.5);
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.stroke();
    ctx.restore();
    // crosshair ticks
    const tc = "rgba(255,255,255,.8)";
    line(ctx, cx - r - 46, cy, cx - r - 30, cy, tc, 1);
    line(ctx, cx + r + 30, cy, cx + r + 46, cy, tc, 1);
    line(ctx, cx, cy - r - 46, cx, cy - r - 30, tc, 1);
    line(ctx, cx, cy + r + 30, cx, cy + r + 46, tc, 1);

    // drop shadow
    ctx.save();
    ctx.shadowColor = "rgba(70,80,110,.35)";
    ctx.shadowBlur = 60 * S;
    ctx.shadowOffsetY = 24 * S;
    circle(ctx, cx, cy, r); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();
    // chromatic edges + white rim
    if (d.fx) {
      circle(ctx, cx + 3, cy, r); ctx.fillStyle = "rgba(70,210,255,.45)"; ctx.fill();
      circle(ctx, cx - 3, cy, r); ctx.fillStyle = "rgba(255,70,110,.35)"; ctx.fill();
    }
    circle(ctx, cx, cy, r + 1.5); ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fill();

    // image (cover, then user zoom/offset)
    ctx.save();
    circle(ctx, cx, cy, r); ctx.clip();
    ctx.fillStyle = "#fff"; ctx.fillRect(cx - r, cy - r, D, D);
    const img = sp.img;
    if (img && img.naturalWidth) {
      const z = sp.zoom || 1;
      const sc = Math.max(D / img.naturalWidth, D / img.naturalHeight) * z;
      const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
      ctx.drawImage(img, cx - w / 2 + (sp.ox || 0) * D, cy - h / 2 + (sp.oy || 0) * D, w, h);
    }
    // glassy sheen: linear-gradient(140deg, ...) with screen blend
    const len = D * (Math.sin((40 * Math.PI) / 180) + Math.cos((40 * Math.PI) / 180));
    const dx = Math.sin((140 * Math.PI) / 180), dy = -Math.cos((140 * Math.PI) / 180);
    const g = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
    g.addColorStop(0, "rgba(255,255,255,.45)");
    g.addColorStop(0.38, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0)");
    g.addColorStop(1, "rgba(200,225,255,.25)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, D, D);
    ctx.restore();

    // label
    if (sp.label) {
      const text = `[ ${sp.label} ]`;
      ctx.font = `400 13px ${FONT_MONO}`;
      const spc = 13 * 0.06;
      const w = spacedWidth(ctx, text, spc);
      ctx.save();
      ctx.globalAlpha = 0.8;
      fxText(ctx, S, d.fx, (o) => fillSpaced(ctx, text, cx - w / 2 + o, cy + r + 58, spc), { color: "rgba(255,255,255,.25)", blur: 18 });
      ctx.restore();
    }
  }

  function logo(ctx, S, d, icon) {
    const glow = { color: "rgba(70,80,105,.35)", blur: 14 };
    const cy = 649, right = 1226;
    ctx.font = `800 30px ${FONT_LOGO}`;
    const tw = ctx.measureText("るっちゃん").width;
    ctx.font = `800 28px ${FONT_LOGO}`;
    const hw = ctx.measureText("#").width;
    const total = hw + 2 + 6 + 58 + 6 + tw;
    const x0 = right - total;
    const ix = x0 + hw + 2 + 6 + 2;

    ctx.font = `800 28px ${FONT_LOGO}`;
    fxText(ctx, S, d.fx, (o) => ctx.fillText("#", x0 + o, 659.6), glow);
    if (icon && icon.naturalWidth) {
      if (d.fx) {
        ctx.save(); ctx.globalAlpha = 0.4; ctx.drawImage(tinted(icon, "rgb(255,70,110)"), ix - 1.5, cy - 27, 54, 54); ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.45; ctx.drawImage(tinted(icon, "rgb(70,210,255)"), ix + 1.5, cy - 27, 54, 54); ctx.restore();
      }
      ctx.drawImage(icon, ix, cy - 27, 54, 54);
    }
    ctx.font = `800 30px ${FONT_LOGO}`;
    fxText(ctx, S, d.fx, (o) => ctx.fillText("るっちゃん", ix + 54 + 2 + 6 + o, 660.3), glow);
  }

  // フォントを先に読み込む（Google Fonts は文字ごとに分割配信なので、使う文字を渡す）
  async function ensureFonts(d) {
    if (!document.fonts || !document.fonts.load) return;
    const sp = d.speakers.map((s) => `[ ${s.label} ]`).join("");
    const mono = ["DATE", "DAY", "TIME", "BY", d.dateText, d.day, d.time, sp].join("");
    const loads = [
      document.fonts.load(`500 92px "Noto Sans JP"`, d.title + d.by),
      document.fonts.load(`400 28px "Noto Sans JP"`, d.sub || "あ"),
      document.fonts.load(`400 21px "JetBrains Mono"`, mono),
      document.fonts.load(`800 30px "M PLUS Rounded 1c"`, "#るっちゃん"),
    ];
    try { await Promise.all(loads); } catch (e) { /* offline: fall back to system fonts */ }
  }

  function draw(canvas, d, assets) {
    const W = canvas.width, H = canvas.height, S = W / BW;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    background(ctx);
    grain(ctx, W, H);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    fog(ctx);
    cornerTicks(ctx);

    const infoLeft = infoBlock(ctx, S, d, true);
    titleBlock(ctx, S, d, Math.min(1164, infoLeft - 58 - 40));
    infoBlock(ctx, S, d, false);

    const n = Math.max(1, Math.min(4, d.speakers.length));
    const D = ICON_D[n], step = D + 136, cy = 384;
    d.speakers.slice(0, 4).forEach((sp, i) => {
      const cx = 640 + (i - (n - 1) / 2) * step;
      speakerBlock(ctx, S, d, sp, cx, cy, D);
    });

    if (d.showLogo) logo(ctx, S, d, assets.logoIcon);
  }

  window.ThumbRenderer = { draw, ensureFonts, BW, BH };
})();
