// サムネイルの描画。比率ごとのデザイン座標（16:9 なら 1280x720）で描き、出力サイズに合わせて拡大する。
(function () {
  // 比率ごとのレイアウト
  //   header: "side"  = タイトル左上・DATE などを右上に（16:9 と同じ）
  //           "stack" = DATE などをタイトルの下に並べる（縦長向け）
  //           "auto"  = side でタイトルが窮屈なら stack
  //   grid:   false = 登壇者は横一列（16:9 と同じ）、true = 空いている場所に合わせて並べ方と大きさを決める
  //   wrap:   タイトルを折り返してよい行数
  // 横長は高さ 720 にそろえて、16:9 と同じ配置を横に広げる。
  const LAYOUTS = {
    "16x9": { W: 1280, H: 720, header: "side", grid: false, wrap: 1 },
    discord: { W: 1800, H: 720, header: "side", grid: false, wrap: 1 },
    ogp: { W: (720 * 1200) / 630, H: 720, header: "side", grid: false, wrap: 1 },
    // 16:9 より幅が狭く 4 人だと横一列に収まらないので、登壇者は grid で並べる
    mac: { W: (720 * 2940) / 1912, H: 720, header: "side", grid: true, wrap: 2 },
    "1x1": { W: 960, H: 960, header: "auto", grid: true, wrap: 2 },
    "4x5": { W: 880, H: 1100, header: "stack", grid: true, wrap: 2 },
    "9x16": { W: 810, H: 1440, header: "stack", grid: true, wrap: 3 },
  };
  // 日本語は Kosugi Maru、英数字は Agave（js/assets.js に埋め込み、英数字の範囲だけ受け持つ）
  const FONT_KANA = '"Kosugi Maru", "Hiragino Maru Gothic ProN", sans-serif';
  const FONT_JP = `"Agave", ${FONT_KANA}`;
  const FONT_MONO = FONT_JP;
  const FONT_LOGO = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
  const RED = "rgba(255,70,110,.45)", CYAN = "rgba(70,210,255,.5)";

  // 人数ごとのアイコン直径（横一列のとき / grid のときの上限）
  const ICON_D = { 1: 250, 2: 232, 3: 200, 4: 168 };
  const GRID_MAX_D = { 1: 300, 2: 260, 3: 240, 4: 220 };
  // アイコン 1 つが占める幅と高さ = 直径 + これ（十字の目盛り・ラベル・すき間）
  const SPEAKER_PAD = 136;

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
  // 英数字（Agave）は日本語（Kosugi Maru）より小さく細く見えるので、少し大きく・太く描き、日本語との境目に少し間をあける。
  // 太さは Regular のふちを同じ色でなぞって出す（Agave の縦線は Regular 170 / Bold 256、2048 = 1em。400→700 で 86/2048em 太る）
  const LATIN_RANGE = "U+0020-007E, U+00A0-00FF";
  const isLatin = (ch) => /[ -~ -ÿ]/.test(ch);
  const TEXT_TITLE = { weight: 480, scale: 1.07, gap: 0.06 };
  const TEXT_SMALL = { weight: 460, scale: 1.07, gap: 0.06 };
  const pxOf = (ctx) => parseFloat(/([\d.]+)px/.exec(ctx.font)[1]);
  function layoutText(ctx, text, px, spacing, st) {
    const keep = ctx.font, items = [];
    let x = 0, prev = null;
    for (const ch of text) {
      const latin = isLatin(ch);
      if (prev !== null && prev !== latin) x += st.gap * px;
      const fs = latin ? px * st.scale : px;
      ctx.font = `400 ${fs}px ${latin ? FONT_JP : FONT_KANA}`;
      items.push({ ch, x, font: ctx.font, stroke: latin ? ((st.weight - 400) / 300) * (86 / 2048) * fs : 0 });
      x += ctx.measureText(ch).width + spacing;
      prev = latin;
    }
    ctx.font = keep;
    return { items, width: x };
  }
  // ctx.font の大きさで、字間 spacing を付けて測る・描く（CSS と同じく末尾にも字間が付く）
  function spacedWidth(ctx, text, spacing, st = TEXT_SMALL) {
    return layoutText(ctx, text, pxOf(ctx), spacing, st).width;
  }
  function fillSpaced(ctx, text, x, y, spacing, st = TEXT_SMALL) {
    const keep = ctx.font;
    for (const it of layoutText(ctx, text, pxOf(ctx), spacing, st).items) {
      ctx.font = it.font;
      ctx.fillText(it.ch, x + it.x, y);
      if (it.stroke > 0) {
        ctx.save();
        ctx.lineWidth = it.stroke; ctx.lineJoin = "round"; ctx.strokeStyle = ctx.fillStyle;
        ctx.strokeText(it.ch, x + it.x, y);
        ctx.restore();
      }
    }
    ctx.font = keep;
  }

  // 白文字 + 色ズレ + ぼんやりした光
  function fxText(ctx, S, fx, draw, glow, color = "#fff") {
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
    ctx.fillStyle = color;
    draw(0);
  }

  // ミュート中の見た目（話者アイコンを光らせる動画で、ミュートした区間に使う）。
  // 輪・十字・ふち・名前を灰色にして薄くし、写真は色を抜いてまわりの色に透かす
  const MUTED = { rgb: "119,123,131", line: 0.6, photoGray: 0.85, photoAlpha: 0.75 };
  const lineColor = (d, a) => (d.muted ? `rgba(${MUTED.rgb},${a * MUTED.line})` : `rgba(255,255,255,${a})`);

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  }
  function circle(ctx, cx, cy, r) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); }

  // ---- layers ----
  function background(ctx, W, H) {
    // radial-gradient(110% 80% at 50% 95%, #c9ccd5 0%, #a7acb8 45%, #8a909e 100%)
    const cx = W / 2, cy = H * 0.95, rx = W * 1.1, ry = H * 0.8, k = ry / rx;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, k);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "#c9ccd5"); g.addColorStop(0.45, "#acb1bd"); g.addColorStop(1, "#9096a3");
    ctx.fillStyle = g;
    ctx.fillRect(-cx, -cy / k, W, H / k);
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
  function fog(ctx, W, H) {
    const cx = W / 2, cy = H * 0.95, rx = W * 0.6, ry = H * 0.35, k = ry / rx;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(1, k);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, "rgba(255,255,255,.55)");
    g.addColorStop(0.7, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
    ctx.restore();
  }
  // 四隅のカギ。角と端を少し丸める
  function cornerTicks(ctx, W, H) {
    const c = "rgba(255,255,255,.85)", w = 1.5, o = 28.75, L = 40, round = 1.5;
    [[o, o, 1, 1], [W - o, o, -1, 1], [o, H - o, 1, -1], [W - o, H - o, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(x + L * sx, y); ctx.arcTo(x, y, x, y + L * sy, round); ctx.lineTo(x, y + L * sy);
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.stroke();
    });
  }

  // タイトルを 1 行で収まる大きさまで縮める。wrap > 1 なら 64px より小さくなる前に折り返しを試し、
  // それでも収まらなければ 1 行のまま 44px まで縮める
  const titleFont = (fs) => `500 ${fs}px ${FONT_JP}`;
  function fitTitle(ctx, text, maxW, wrap) {
    const fits = (fs, lines) => {
      ctx.font = titleFont(fs);
      return lines.every((l) => spacedWidth(ctx, l, 0, TEXT_TITLE) <= maxW);
    };
    for (let fs = 92; fs >= (wrap > 1 ? 64 : 44); fs -= 2) if (fits(fs, [text])) return { fs, lines: [text] };
    if (wrap > 1) {
      for (let fs = 84; fs >= 44; fs -= 2) {
        ctx.font = titleFont(fs);
        const lines = wrapText(ctx, text, maxW);
        if (lines.length <= wrap && fits(fs, lines)) return { fs, lines };
      }
    }
    return { fs: 44, lines: [text] };
  }
  // 英数字のかたまりは切らずに、日本語は 1 文字ずつ折り返す。句読点や閉じかっこは行頭に来ないようにする
  function wrapText(ctx, text, maxW) {
    const tokens = text.match(/[A-Za-z0-9_.\-+#&'/]+|\s+|./gu) || [];
    const lines = [];
    let cur = "";
    for (const t of tokens) {
      const next = cur + t;
      if (cur.trim() && spacedWidth(ctx, next.trimEnd(), 0, TEXT_TITLE) > maxW && !/^[\s、。，．,.!?！？…ー）」』】〕\])]/.test(t)) {
        lines.push(cur.trim());
        cur = t.trimStart();
      } else cur = next;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  // サブタイトルの前の伸ばし棒の長さと、サブタイトルの左端
  const SUB_DASH = 43, SUB_X = 58 + SUB_DASH + 20;

  // タイトルとサブタイトル。下端の y を返す
  // 回数（d.vol.pos で置き場所が変わる）
  const volFont = (jp, px) => (jp ? `500 ${px * 1.1}px ${FONT_JP}` : `500 ${px}px ${FONT_MONO}`);
  const volSpacing = (jp, px) => px * (jp ? 0.08 : 0.12);
  const volAt = (d, pos) => (d.vol && d.vol.pos === pos ? d.vol : null);
  const GLOW = { color: "rgba(255,255,255,.25)", blur: 18 };
  function volText(ctx, S, d, v, px, x, y, alpha) {
    ctx.font = volFont(v.jp, px);
    ctx.save();
    ctx.globalAlpha = alpha;
    fxText(ctx, S, d.fx, (dx) => fillSpaced(ctx, v.text, x + dx, y, volSpacing(v.jp, px)), GLOW);
    ctx.restore();
  }
  function volWidth(ctx, v, px) {
    ctx.font = volFont(v.jp, px);
    return spacedWidth(ctx, v.text, volSpacing(v.jp, px));
  }

  function titleBlock(ctx, S, d, maxW, wrap) {
    let top = 50;
    const kicker = volAt(d, "title");
    if (kicker) {
      volText(ctx, S, d, kicker, 20, 60, top + 20, 0.85);
      top += 34;
    }
    // タイトルの前に置くときは、タイトルの半分の大きさで横に並べる
    const inline = volAt(d, "inline");
    const inlineW = (fs) => (inline ? volWidth(ctx, inline, fs * 0.5) + fs * 0.2 : 0);
    const { fs, lines } = fitTitle(ctx, d.title, maxW - inlineW(92), wrap);
    const lh = fs * 1.1;
    const base = top + 0.961 * fs;
    let x = 58;
    if (inline) {
      volText(ctx, S, d, inline, fs * 0.5, 60, base, 0.8);
      x += inlineW(fs);
    }
    ctx.font = titleFont(fs);
    fxText(ctx, S, d.fx, (dx) => lines.forEach((l, i) => fillSpaced(ctx, l, x + dx, base + i * lh, 0, TEXT_TITLE)), GLOW);
    let bottom = top + 1.05 * fs + (lines.length - 1) * lh;

    const after = volAt(d, "sub");
    if (after && !d.sub) {
      volText(ctx, S, d, after, 24, 60, bottom + 14 + 32.5, 0.85);
      bottom += 14 + 40;
    }
    if (d.sub) {
      const top = bottom + 14;
      ctx.font = `400 28px ${FONT_JP}`;
      // 伸ばし棒（長さ SUB_DASH、端は丸）と文字
      fxText(ctx, S, d.fx, (dx) => {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(58 + dx + 0.75, top + 20.25); ctx.lineTo(58 + dx + SUB_DASH - 0.75, top + 20.25);
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.stroke();
        ctx.restore();
        fillSpaced(ctx, d.sub, SUB_X + dx, top + 32.5, 28 * 0.12);
      }, GLOW);
      if (after) {
        const subW = spacedWidth(ctx, d.sub, 28 * 0.12);
        volText(ctx, S, d, after, 24, SUB_X + subW + 14, top + 32.5, 0.85);
      }
      bottom = top + 40;
    }
    return bottom;
  }

  // DATE / DAY / TIME / BY。pos.right を渡すと右寄せ（右上用）、pos.left を渡すと左寄せの表にする。
  // 左端の x と下端の y を返す（タイトルの最大幅や登壇者の位置を決めるため）
  function infoBlock(ctx, S, d, pos, measureOnly) {
    const info = volAt(d, "info");
    const rows = [info ? [info.key, info.value, info.jp] : [], ["DATE", d.dateText, false], ["DAY", d.day, false], ["TIME", d.time, false], ["BY", d.by, true]]
      .filter((r) => r[1]);
    ctx.font = `400 13px ${FONT_MONO}`;
    const keyCol = Math.max(0, ...rows.map((r) => spacedWidth(ctx, r[0], 13 * 0.06)));
    let minLeft = pos.right != null ? pos.right : pos.left;
    rows.forEach(([k, v, jp], i) => {
      const base = pos.top + i * 36.75;
      ctx.font = jp ? `500 21px ${FONT_JP}` : `400 21px ${FONT_MONO}`;
      const sp = 21 * (jp ? 0.04 : 0.06);
      const vw = spacedWidth(ctx, v, sp);
      ctx.font = `400 13px ${FONT_MONO}`;
      const kw = spacedWidth(ctx, k, 13 * 0.06);
      const vx = pos.right != null ? pos.right - vw : pos.left + keyCol + 14;
      const kx = pos.right != null ? vx - 14 - kw : pos.left;
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
    return { left: minLeft, bottom: pos.top + (rows.length - 1) * 36.75 + 6 };
  }

  // (cx, cy) から半径 r0〜r1 の輪の中の、いま描かれている色の平均（canvas の座標に直して読む）
  function bandColor(ctx, cx, cy, r0, r1) {
    const t = ctx.getTransform(), k = t.a;
    const px = t.e + cx * k, py = t.f + cy * k, R = Math.ceil(r1 * k) + 1;
    const x0 = Math.max(0, Math.floor(px - R)), y0 = Math.max(0, Math.floor(py - R));
    const w = Math.min(ctx.canvas.width - x0, 2 * R + 1), h = Math.min(ctx.canvas.height - y0, 2 * R + 1);
    const data = ctx.getImageData(x0, y0, w, h).data;
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dd = Math.hypot(x0 + x + 0.5 - px, y0 + y + 0.5 - py) / k;
      if (dd < r0 || dd > r1) continue;
      const i = (y * w + x) * 4;
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; n++;
    }
    return n ? `rgb(${sum.map((v) => Math.round(v / n)).join(",")})` : "#fff";
  }

  function speakerBlock(ctx, S, d, sp, cx, cy, D) {
    const r = D / 2;
    // rings
    circle(ctx, cx, cy, r + 26 - 0.5);
    ctx.strokeStyle = lineColor(d, 0.55); ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.setLineDash([3, 3]);
    circle(ctx, cx, cy, r + 14 - 0.5);
    ctx.strokeStyle = lineColor(d, 0.35); ctx.stroke();
    ctx.restore();
    // crosshair ticks
    const tc = lineColor(d, 0.8);
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
    if (d.fx && !d.muted) {
      circle(ctx, cx + 3, cy, r); ctx.fillStyle = "rgba(70,210,255,.45)"; ctx.fill();
      circle(ctx, cx - 3, cy, r); ctx.fillStyle = "rgba(255,70,110,.35)"; ctx.fill();
    }
    // ミュート中は、写真を透かした下に見せる色として、ふちのすぐ外（影の上）の色の平均を取っておく
    const under = d.muted ? bandColor(ctx, cx, cy, r + 6, r + 12) : "#fff";
    circle(ctx, cx, cy, r + 1.5); ctx.fillStyle = lineColor(d, 0.9); ctx.fill();

    // image (cover, then user zoom/offset)
    ctx.save();
    circle(ctx, cx, cy, r); ctx.clip();
    ctx.fillStyle = "#fff"; ctx.fillRect(cx - r, cy - r, D, D);
    const img = sp.img;
    if (img && img.naturalWidth) {
      const z = sp.zoom || 1;
      const sc = Math.max(D / img.naturalWidth, D / img.naturalHeight) * z;
      const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
      ctx.save();
      if (d.muted) ctx.filter = `grayscale(${MUTED.photoGray})`;
      ctx.drawImage(img, cx - w / 2 + (sp.ox || 0) * D, cy - h / 2 + (sp.oy || 0) * D, w, h);
      ctx.restore();
    }
    // ミュート中は写真（白地ごと）を photoAlpha の濃さにする = まわりの色を 1 - photoAlpha だけ重ねる
    if (d.muted) {
      ctx.save();
      ctx.globalAlpha = 1 - MUTED.photoAlpha;
      ctx.fillStyle = under; ctx.fillRect(cx - r, cy - r, D, D);
      ctx.restore();
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
      ctx.globalAlpha = d.muted ? 0.8 * MUTED.line : 0.8;
      fxText(ctx, S, d.fx && !d.muted, (o) => fillSpaced(ctx, text, cx - w / 2 + o, cy + r + 58, spc), { color: "rgba(255,255,255,.25)", blur: 18 },
        d.muted ? `rgb(${MUTED.rgb})` : "#fff");
      ctx.restore();
    }
  }

  // 右上の表（DATE など）の右端と 1 行目のベースライン
  const INFO_RIGHT = 58, INFO_TOP = 81.9;
  // 右下のロゴ（# ・作アイコン・るっちゃん）。文字の大きさ、アイコンの大きさ、それぞれの間
  const LOGO = { text: 21, icon: 47, gap: 7 };
  // ロゴは右上の表と同じだけ画面の端から離す。上下は表の 1 行目の文字の上端とアイコンの下端、
  // 左右は表と「るっちゃん」の文字の右端（字の中の空きは除く）をそろえる。アイコンの中心の y と、文字の送りの右端を返す
  function logoBox(ctx, d, W, H) {
    const keep = ctx.font;
    const date = d.dateText || "2026/10/21";
    ctx.font = `400 ${21 * TEXT_SMALL.scale}px ${FONT_MONO}`;
    const top = INFO_TOP - ctx.measureText(date).actualBoundingBoxAscent;
    const last = ctx.measureText(date.slice(-1));
    const right = INFO_RIGHT + 21 * 0.06 + (last.width - last.actualBoundingBoxRight);
    ctx.font = `800 ${LOGO.text}px ${FONT_LOGO}`;
    const n = ctx.measureText("ん");
    ctx.font = keep;
    return { cy: H - top - LOGO.icon / 2, right: W - right + (n.width - n.actualBoundingBoxRight) };
  }
  function logo(ctx, S, d, icon, W, H) {
    const glow = { color: "rgba(70,80,105,.35)", blur: 14 };
    const { cy, right } = logoBox(ctx, d, W, H);
    const ts = LOGO.text, hs = (ts * 28) / 30, is = LOGO.icon, g = LOGO.gap;
    ctx.font = `800 ${ts}px ${FONT_LOGO}`;
    const tw = ctx.measureText("るっちゃん").width;
    ctx.font = `800 ${hs}px ${FONT_LOGO}`;
    const hw = ctx.measureText("#").width;
    const x0 = right - (hw + g + is + g + tw);
    const ix = x0 + hw + g;

    fxText(ctx, S, d.fx, (o) => ctx.fillText("#", x0 + o, cy + 0.378 * hs), glow);
    if (icon && icon.naturalWidth) {
      if (d.fx) {
        ctx.save(); ctx.globalAlpha = 0.4; ctx.drawImage(tinted(icon, "rgb(255,70,110)"), ix - 1.5, cy - is / 2, is, is); ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.45; ctx.drawImage(tinted(icon, "rgb(70,210,255)"), ix + 1.5, cy - is / 2, is, is); ctx.restore();
      }
      ctx.drawImage(icon, ix, cy - is / 2, is, is);
    }
    ctx.font = `800 ${ts}px ${FONT_LOGO}`;
    fxText(ctx, S, d.fx, (o) => ctx.fillText("るっちゃん", ix + is + g + o, cy + 0.377 * ts), glow);
  }

  // Agave は js/assets.js に埋め込んだものを、英数字の範囲だけのフォントとして登録する
  let agaveAdded = false;
  function addAgave() {
    const src = window.THUMB_ASSETS && window.THUMB_ASSETS.fonts && window.THUMB_ASSETS.fonts.agave;
    if (agaveAdded || !src || !window.FontFace) return;
    document.fonts.add(new FontFace("Agave", `url(${src})`, { unicodeRange: LATIN_RANGE }));
    agaveAdded = true;
  }

  // フォントを先に読み込む（Google Fonts は文字ごとに分割配信なので、使う文字を渡す）
  async function ensureFonts(d) {
    if (!document.fonts || !document.fonts.load) return;
    addAgave();
    const sp = d.speakers.map((s) => `[ ${s.label} ]`).join("");
    const vol = d.vol ? d.vol.text + d.vol.key + d.vol.value : "";
    const text = [d.title, d.sub, d.by, "DATE", "DAY", "TIME", "BY", d.dateText, d.day, d.time, sp, vol].join("");
    const loads = [
      document.fonts.load(`400 92px ${FONT_KANA}`, text || "あ"),
      document.fonts.load(`400 21px "Agave"`, "0"),
      document.fonts.load(`800 30px "M PLUS Rounded 1c"`, "#るっちゃん"),
    ];
    try { await Promise.all(loads); } catch (e) { /* offline: fall back to system fonts */ }
  }

  // 登壇者を area の中に並べる。行数を 1〜n 行で試して、いちばん大きく描ける並べ方を選ぶ（最後の行は中央寄せ）
  function gridPlacement(n, area) {
    let best = null;
    for (let rows = 1; rows <= n; rows++) {
      const cols = Math.ceil(n / rows);
      if ((rows - 1) * cols >= n) continue; // 空の行ができる
      const D = Math.min(area.w / cols, area.h / rows) - SPEAKER_PAD;
      if (!best || D > best.D) best = { rows, cols, D };
    }
    const D = Math.max(60, Math.min(GRID_MAX_D[n], best.D));
    const cell = D + SPEAKER_PAD;
    const top = area.y + (area.h - best.rows * cell) / 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / best.cols), c = i % best.cols;
      const inRow = Math.min(best.cols, n - r * best.cols);
      out.push({
        cx: area.x + area.w / 2 + (c - (inRow - 1) / 2) * cell,
        // 目盛りの上端（-r-46）からラベルの下端（+r+62）までの真ん中をセルの中心にそろえる
        cy: top + (r + 0.5) * cell - 8,
        D,
      });
    }
    return out;
  }

  function draw(canvas, d, assets, layoutId) {
    const L = LAYOUTS[layoutId] || LAYOUTS["16x9"];
    const BW = L.W, BH = L.H;
    const W = canvas.width, H = canvas.height, S = W / BW;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";

    background(ctx, BW, BH);
    grain(ctx, W, H);
    ctx.setTransform(S, 0, 0, S, 0, 0);
    fog(ctx, BW, BH);
    cornerTicks(ctx, BW, BH);
    const big = volAt(d, "big");
    if (big) {
      // 背景の透かし。右下に大きく、登壇者やタイトルより奥に置く
      const px = Math.min(BW, BH) * 0.42;
      ctx.font = volFont(big.jp, px);
      const w = spacedWidth(ctx, big.text, 0);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "#fff";
      fillSpaced(ctx, big.text, BW - 40 - w, BH - 40, 0);
      ctx.restore();
    }

    const side = { right: BW - INFO_RIGHT, top: INFO_TOP };
    const infoLeft = infoBlock(ctx, S, d, side, true).left;
    const sideTitleW = Math.min(BW - 116, infoLeft - 58 - 40);
    let header = L.header;
    if (header === "auto") header = fitTitle(ctx, d.title, sideTitleW, 1).fs >= 64 ? "side" : "stack";
    let headerBottom;
    if (header === "side") {
      const titleBottom = titleBlock(ctx, S, d, sideTitleW, L.wrap);
      headerBottom = Math.max(titleBottom, infoBlock(ctx, S, d, side, false).bottom);
    } else {
      const titleBottom = titleBlock(ctx, S, d, BW - 116, L.wrap);
      headerBottom = infoBlock(ctx, S, d, { left: 58, top: titleBottom + 52 }, false).bottom;
    }

    const sps = d.speakers.slice(0, 4);
    const n = Math.max(1, sps.length);
    const logoCy = logoBox(ctx, d, BW, BH).cy;
    let places;
    if (L.grid) {
      const top = headerBottom + 40;
      const bottom = d.showLogo || volAt(d, "corner") ? logoCy - LOGO.icon / 2 - 16 : BH - 44;
      places = gridPlacement(n, { x: 58, y: top, w: BW - 116, h: bottom - top });
    } else {
      const D = ICON_D[n], step = D + SPEAKER_PAD;
      places = sps.map((_, i) => ({ cx: BW / 2 + (i - (n - 1) / 2) * step, cy: 384, D }));
    }
    sps.forEach((sp, i) => speakerBlock(ctx, S, d, sp, places[i].cx, places[i].cy, places[i].D));

    if (d.showLogo) logo(ctx, S, d, assets.logoIcon, BW, BH);
    // 左下。ロゴと同じ高さにそろえる
    const corner = volAt(d, "corner");
    if (corner) volText(ctx, S, d, corner, 44, 60, logoCy + 16, 0.9);
  }

  window.ThumbRenderer = { draw, ensureFonts, LAYOUTS };
})();
