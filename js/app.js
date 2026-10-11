(function () {
  const A = window.THUMB_ASSETS;
  const R = window.ThumbRenderer;
  const KEY = "tsukurucchan-thumb:v1";
  const MAX_SPEAKERS = 4;
  const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };
  const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

  const newSpeaker = (o = {}) => ({ name: "", label: "", src: null, zoom: 1, ox: 0, oy: 0, ...o });
  const defaults = () => ({
    title: "UnityのR3とか",
    sub: "だべる会",
    date: "2026-10-12",
    day: "",
    time: "11:00~13:00",
    by: "",
    fx: true,
    showLogo: true,
    format: "jpeg",
    size: 1920,
    speakers: [
      newSpeaker({ name: "そーま", label: "SO-MA", src: A.samples.soma }),
      newSpeaker({ name: "へのへのん", label: "HENOHENON", src: A.samples.henohenon }),
    ],
  });

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const d = defaults();
      return { ...d, ...s, speakers: (s.speakers || d.speakers).map((x) => newSpeaker(x)) };
    } catch (e) { return null; }
  }
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) {
        // 画像で容量オーバーしたら文字だけ保存する
        try { localStorage.setItem(KEY, JSON.stringify({ ...state, speakers: state.speakers.map((s) => ({ ...s, src: null })) })); }
        catch (e2) { /* storage unavailable */ }
      }
    }, 300);
  }

  let state = load() || defaults();

  // ---------- images ----------
  const imgCache = new Map();
  function imgFor(src) {
    if (!src) return null;
    let img = imgCache.get(src);
    if (!img) {
      img = new Image();
      img.onload = schedule;
      img.src = src;
      imgCache.set(src, img);
    }
    return img;
  }
  const logoIcon = new Image();
  logoIcon.onload = schedule;
  logoIcon.src = A.logoIcon;

  // 取り込み時に長辺 800px・白背景の JPEG にそろえる（保存容量と描画速度のため）
  function importFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) return reject(new Error("画像ファイルを選んでください"));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        const x = c.getContext("2d");
        x.fillStyle = "#fff";
        x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした")); };
      img.src = url;
    });
  }

  // ---------- derived view for the renderer ----------
  function parseDate(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function autoDay() { const d = parseDate(state.date); return d ? DAYS[d.getDay()] : ""; }
  function autoBy() { return state.speakers.map((s) => s.name.trim()).filter(Boolean).join(", "); }
  function view() {
    return {
      title: state.title,
      sub: state.sub,
      dateText: (state.date || "").replace(/-/g, "/"),
      day: state.day.trim() || autoDay(),
      time: state.time,
      by: state.by.trim() || autoBy(),
      fx: state.fx,
      showLogo: state.showLogo,
      speakers: state.speakers.map((s) => ({ label: s.label.trim(), zoom: s.zoom, ox: s.ox, oy: s.oy, img: imgFor(s.src) })),
    };
  }

  // ---------- preview ----------
  const canvas = document.getElementById("preview");
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(async () => {
      queued = false;
      const d = view();
      await R.ensureFonts(d);
      R.draw(canvas, d, { logoIcon });
    });
  }
  if (document.fonts) document.fonts.addEventListener("loadingdone", schedule);

  // ---------- text fields ----------
  const fields = document.querySelectorAll("[data-key]");
  function syncFields() {
    fields.forEach((el) => {
      const k = el.dataset.key;
      if (el.type === "checkbox") el.checked = !!state[k];
      else el.value = state[k];
    });
    document.getElementById("day").placeholder = autoDay() || "自動";
    document.getElementById("by").placeholder = autoBy() || "名前から自動";
    document.querySelectorAll("[data-format]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.format === state.format)));
  }
  fields.forEach((el) => {
    el.addEventListener("input", () => {
      const k = el.dataset.key;
      if (el.type === "checkbox") state[k] = el.checked;
      else if (k === "size") state[k] = +el.value;
      else state[k] = el.value;
      if (k === "date") document.getElementById("day").placeholder = autoDay() || "自動";
      save(); schedule();
    });
  });

  // ---------- speakers ----------
  const list = document.getElementById("speakers");
  const tpl = document.getElementById("speaker-tpl");
  function renderSpeakers() {
    list.innerHTML = "";
    state.speakers.forEach((s, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      const q = (sel) => node.querySelector(sel);
      q(".sp-index").textContent = String(i + 1).padStart(2, "0");
      const thumb = q(".sp-thumb");
      if (s.src) thumb.style.backgroundImage = `url("${s.src}")`;
      q(".sp-name").value = s.name;
      q(".sp-label").value = s.label;
      q(".sp-zoom").value = Math.round(s.zoom * 100);
      q(".sp-ox").value = Math.round(s.ox * 100);
      q(".sp-oy").value = Math.round(s.oy * 100);
      const out = () => { q(".sp-zoom-out").textContent = Math.round(s.zoom * 100) + "%"; };
      out();

      q(".sp-name").addEventListener("input", (e) => { s.name = e.target.value; document.getElementById("by").placeholder = autoBy() || "名前から自動"; save(); schedule(); });
      q(".sp-label").addEventListener("input", (e) => { s.label = e.target.value; save(); schedule(); });
      q(".sp-zoom").addEventListener("input", (e) => { s.zoom = e.target.value / 100; out(); save(); schedule(); });
      q(".sp-ox").addEventListener("input", (e) => { s.ox = e.target.value / 100; save(); schedule(); });
      q(".sp-oy").addEventListener("input", (e) => { s.oy = e.target.value / 100; save(); schedule(); });
      q(".sp-reset").addEventListener("click", () => { s.zoom = 1; s.ox = 0; s.oy = 0; renderSpeakers(); save(); schedule(); });

      const setFile = async (file) => {
        try {
          s.src = await importFile(file);
          s.zoom = 1; s.ox = 0; s.oy = 0;
          renderSpeakers(); save(); schedule();
        } catch (err) { toast(err.message); }
      };
      q(".sp-file").addEventListener("change", (e) => setFile(e.target.files[0]));
      node.addEventListener("dragover", (e) => { e.preventDefault(); node.classList.add("drop"); });
      node.addEventListener("dragleave", () => node.classList.remove("drop"));
      node.addEventListener("drop", (e) => { e.preventDefault(); node.classList.remove("drop"); setFile(e.dataTransfer.files[0]); });

      const up = q(".sp-up"), down = q(".sp-down"), del = q(".sp-del");
      up.disabled = i === 0;
      down.disabled = i === state.speakers.length - 1;
      del.disabled = state.speakers.length <= 1;
      up.addEventListener("click", () => move(i, -1));
      down.addEventListener("click", () => move(i, 1));
      del.addEventListener("click", () => { state.speakers.splice(i, 1); afterSpeakersChange(); });
      list.appendChild(node);
    });
    document.getElementById("add-speaker").disabled = state.speakers.length >= MAX_SPEAKERS;
    document.getElementById("speaker-count").textContent = `${state.speakers.length} / ${MAX_SPEAKERS}`;
  }
  function move(i, dir) {
    const j = i + dir;
    [state.speakers[i], state.speakers[j]] = [state.speakers[j], state.speakers[i]];
    afterSpeakersChange();
  }
  function afterSpeakersChange() {
    renderSpeakers();
    document.getElementById("by").placeholder = autoBy() || "名前から自動";
    save(); schedule();
  }
  document.getElementById("add-speaker").addEventListener("click", () => {
    if (state.speakers.length >= MAX_SPEAKERS) return;
    state.speakers.push(newSpeaker());
    afterSpeakersChange();
  });

  // ---------- export ----------
  document.querySelectorAll("[data-format]").forEach((b) =>
    b.addEventListener("click", () => { state.format = b.dataset.format; syncFields(); save(); })
  );
  const status = document.getElementById("status");
  document.getElementById("download").addEventListener("click", async () => {
    const d = view();
    await R.ensureFonts(d);
    const W = +state.size || 1920;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = Math.round((W * 9) / 16);
    R.draw(c, d, { logoIcon });
    const want = MIME[state.format];
    const blob = await new Promise((res) => c.toBlob(res, want, 0.92));
    if (!blob) { toast("書き出しに失敗しました"); return; }
    const ext = EXT[blob.type] || "png";
    const name = `thumbnail_${state.date || "untitled"}.${ext}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    const mb = (blob.size / 1024 / 1024).toFixed(2);
    status.textContent = `${name} · ${c.width}×${c.height} · ${mb} MB`;
    if (blob.type !== want) toast(`このブラウザは ${state.format.toUpperCase()} 書き出しに未対応なので ${ext.toUpperCase()} で保存しました`);
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("入力をすべて初期状態に戻しますか？")) return;
    state = defaults();
    syncFields(); renderSpeakers(); save(); schedule();
  });

  let toastTimer = 0;
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 4000);
  }

  syncFields();
  renderSpeakers();
  schedule();
})();
