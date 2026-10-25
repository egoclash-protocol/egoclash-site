/* EGOCLASH — vanilla JS, no build step. */

/* ---- CONFIG -------------------------------------------------------------
   TODO: the Discord invite link is unknown. Put a public invite here, e.g.
   "https://discord.gg/xxxxxxx". While it is "" every Discord button stays hidden. */
const DISCORD_URL = "";
/* ------------------------------------------------------------------------ */

const CA   = "BrfMCtwXY7tLvgmPD2wFk55ckvFms2MVNrzu1yZBpump";
const POOL = "5fvDMYSknBA7bsdL4iiwxqm2svHP3d9bthczVoEE1z4B";
const API  = "https://api.dexscreener.com/latest/dex/tokens/" + CA;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Discord (only if configured) */
if (/^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/i.test(DISCORD_URL)) {
  $$("[data-discord]").forEach(a => { a.href = DISCORD_URL; a.hidden = false; });
}

/* Marquee */
(function () {
  const words = ["FEED ME A STRAY CAT", "04:12", "FOR THE RECORD", "CHAIRS ARE FREE", "FILED UNDER WORK IN PROGRESS", "FOOTNOTES", "PID 000", "NOBODY AGREES", "CHECK THE CHAIN"];
  const t = $("#track"); if (!t) return;
  const row = words.map(w => `<span>${w}</span><span>✦</span>`).join("");
  t.innerHTML = row + row;
})();

/* Mobile menu */
(function () {
  const b = $("#burger"), m = $("#mobile");
  b.addEventListener("click", () => {
    const o = m.classList.toggle("open");
    b.setAttribute("aria-expanded", o); b.textContent = o ? "✕" : "☰";
  });
  $$("a", m).forEach(a => a.addEventListener("click", () => { m.classList.remove("open"); b.setAttribute("aria-expanded", false); b.textContent = "☰"; }));
})();

/* Toast + copy */
const toast = $("#toast");
let toastT;
function showToast(msg) {
  toast.textContent = msg; toast.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("show"), 1800);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove(); return ok;
  }
}
$$("[data-copy]").forEach(btn => btn.addEventListener("click", async () => {
  const ok = await copyText(btn.dataset.copy);
  const label = $("span", btn);
  if (ok) {
    btn.classList.add("done"); if (label) label.textContent = "Copied";
    showToast("Contract address copied");
    setTimeout(() => { btn.classList.remove("done"); if (label) label.textContent = "Copy"; }, 1800);
  } else showToast("Select the address and copy manually");
}));

/* Live market data (DexScreener) with graceful fallback */
const nfCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const SUB = "₀₁₂₃₄₅₆₇₈₉";
function fmtPrice(p) {
  if (!isFinite(p) || p <= 0) return "—";
  if (p >= 0.01) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const zeros = Math.floor(-Math.log10(p));
  const digits = p.toFixed(zeros + 4).slice(2 + zeros);
  return zeros >= 3 ? "$0.0" + String(zeros).split("").map(d => SUB[d]).join("") + digits : "$" + p.toFixed(zeros + 4);
}
const venueName = id => ({ pumpfun: "pump.fun bonding curve", pumpswap: "PumpSwap" }[id] || id);
async function loadStats() {
  const note = $("#stats-note");
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(API, { signal: ctl.signal, cache: "no-store" }); clearTimeout(to);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const pairs = (j.pairs || []).filter(p => p.chainId === "solana");
    const p = pairs.find(x => x.pairAddress === POOL) || pairs[0];
    if (!p) throw new Error("no pair");
    $("#s-price").textContent = fmtPrice(parseFloat(p.priceUsd));
    const mc = p.marketCap || p.fdv;
    $("#s-mcap").textContent = mc ? "$" + nfCompact.format(mc) : "—";
    $("#s-vol").textContent = p.volume && p.volume.h24 != null ? "$" + nfCompact.format(p.volume.h24) : "—";
    const c = p.priceChange && p.priceChange.h24;
    const ce = $("#s-chg");
    if (c != null) { ce.textContent = (c > 0 ? "+" : "") + c.toFixed(2) + "%"; ce.className = "v " + (c >= 0 ? "up" : "down"); }
    note.innerHTML = `Live from DexScreener · venue: <b>${venueName(p.dexId)}</b> · updated ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Informational only, not a prediction. <a href="https://dexscreener.com/solana/${POOL}" target="_blank" rel="noopener">DexScreener ↗</a>`;
  } catch (e) {
    note.innerHTML = `Live data unavailable right now. <a href="https://dexscreener.com/solana/${POOL}" target="_blank" rel="noopener">See it on DexScreener ↗</a>`;
  }
}
loadStats(); setInterval(() => { if (!document.hidden) loadStats(); }, 60000);

/* Scroll reveal */
(function () {
  const els = $$(".rv");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12, rootMargin: "0px 0px -40px 0px" });
  els.forEach(e => io.observe(e));
})();

/* Character cards: cursor glow */
$$(".char").forEach(c => c.addEventListener("pointermove", e => {
  const r = c.getBoundingClientRect();
  c.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
  c.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
}));

/* X embeds: load widgets.js when the section is near the viewport */
(function () {
  const sec = $("#posts"); if (!sec) return;
  let loaded = false;
  const load = () => {
    if (loaded) return; loaded = true;
    const s = document.createElement("script");
    s.src = "https://platform.twitter.com/widgets.js"; s.async = true; s.charset = "utf-8";
    document.body.appendChild(s);
  };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { load(); o.disconnect(); } }, { rootMargin: "800px" }).observe(sec);
  } else load();
})();

/* Neon sparks */
(function () {
  const cv = $("#sparks"); if (!cv || reduce) return;
  const ctx = cv.getContext("2d");
  let W, H, DPR = Math.min(devicePixelRatio || 1, 1.5), parts = [], raf;
  const cols = ["#ffc23a", "#ff7a1a", "#22e6ff", "#ff3df2"];
  function size() { W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR; }
  function mk(init) {
    return { x: Math.random() * W, y: init ? Math.random() * H : H + 10, s: (1 + Math.random() * 2.6) * DPR, v: (.15 + Math.random() * .5) * DPR, d: (Math.random() - .5) * .25 * DPR, c: cols[(Math.random() * cols.length) | 0], a: .25 + Math.random() * .55 };
  }
  function init() { size(); const n = innerWidth < 700 ? 28 : 55; parts = Array.from({ length: n }, () => mk(true)); }
  function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.y -= p.v; p.x += p.d;
      if (p.y < -10) Object.assign(p, mk(false));
      ctx.globalAlpha = p.a; ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 8 * DPR;
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    raf = requestAnimationFrame(tick);
  }
  init(); tick();
  addEventListener("resize", init);
  document.addEventListener("visibilitychange", () => { cancelAnimationFrame(raf); if (!document.hidden) tick(); });
})();
