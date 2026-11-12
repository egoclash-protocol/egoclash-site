/* EGOCLASH — UI on top of the room: panels, live data, typing, quote maker, sound. No build step. */
(function () {
  "use strict";
  const E = window.EGOC, ROOM = window.ROOM || { ok: false };
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const is3d = !!ROOM.ok, root = document.documentElement;
  root.classList.add(is3d ? "is3d" : "flat");

  if (/^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/i.test(E.DISCORD_URL)) $$("[data-discord]").forEach(a => { a.href = E.DISCORD_URL; a.hidden = false; });

  /* ---------- toast + copy ---------- */
  const toast = $("#toast"); let toastT;
  function say(msg) { toast.textContent = msg; toast.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove("show"), 2200); }
  async function copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch (e) { const ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (_) {} ta.remove(); return ok; } }
  $$("[data-copy]").forEach(b => b.addEventListener("click", async () => { const ok = await copyText(E.CA); say(ok ? "CONTRACT ADDRESS COPIED" : "SELECT THE ADDRESS AND COPY MANUALLY"); if (ok) { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1500); } }));

  /* ---------- sound (off by default): synthesized machine-room sounds, nothing shrill ---------- */
  const snd = { on: false, ctx: null, out: null, noise: null };
  function initSnd() { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; const c = snd.ctx = new C();
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; snd.out = c.createGain(); snd.out.gain.value = 0; snd.out.connect(lp).connect(c.destination);
    const n = c.sampleRate * 2, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; snd.noise = buf;
    /* room tone: cooling fans (low-passed noise) + 50 Hz mains hum */
    const fan = c.createBufferSource(); fan.buffer = buf; fan.loop = true; const f1 = c.createBiquadFilter(); f1.type = "lowpass"; f1.frequency.value = 260; const f2 = c.createBiquadFilter(); f2.type = "lowpass"; f2.frequency.value = 420; const fg = c.createGain(); fg.gain.value = .22; fan.connect(f1).connect(f2).connect(fg).connect(snd.out); fan.start();
    [50, 100].forEach((f, k) => { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.value = k ? .012 : .03; o.connect(g).connect(snd.out); o.start(); }); }
  function burst(freq, q, dur, vol, delay) { if (!snd.on || !snd.ctx) return; const c = snd.ctx, t = c.currentTime + (delay || 0), src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); src.buffer = snd.noise; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur); src.connect(f).connect(g).connect(snd.out); src.start(t, Math.random()); src.stop(t + dur + .02); }
  function tone(freq, dur, vol, delay, type) { if (!snd.on || !snd.ctx) return; const c = snd.ctx, t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain(); o.type = type || "sine"; o.frequency.value = freq; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g).connect(snd.out); o.start(t); o.stop(t + dur + .02); }
  const key = () => { burst(900 + Math.random() * 500, 1.4, .04, .32); tone(88, .035, .12); };                                         /* mechanical key */
  const seek = () => { for (let i = 0; i < 5; i++) burst(420 + Math.random() * 500, 5, .014, .5, i * .034 + Math.random() * .012); }; /* disk seek chatter */
  const beep = () => { tone(294, .08, .09, 0, "triangle"); tone(392, .11, .09, .08, "triangle"); };                                    /* soft terminal confirm */
  const thud = () => tone(110, .12, .12);                                                                                               /* relay / close */
  const purr = () => { if (!snd.on || !snd.ctx) return; const c = snd.ctx, t = c.currentTime, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(); src.buffer = snd.noise; f.type = "lowpass"; f.frequency.value = 170; g.gain.value = .5; lfo.frequency.value = 24; lg.gain.value = .5; lfo.connect(lg).connect(g.gain); src.connect(f).connect(g).connect(snd.out); g.gain.setValueAtTime(.5, t); g.gain.linearRampToValueAtTime(.0001, t + .9); src.start(t); lfo.start(t); src.stop(t + .95); lfo.stop(t + .95); };
  const meow = purr, whoosh = () => { seek(); beep(); };
  const sb = $("#sound"); if (sb) sb.addEventListener("click", () => { snd.on = !snd.on; if (snd.on && !snd.ctx) initSnd(); if (snd.ctx) { snd.ctx.resume && snd.ctx.resume(); snd.out.gain.setTargetAtTime(snd.on ? .8 : 0, snd.ctx.currentTime, .08); } sb.textContent = snd.on ? "SOUND ON" : "SOUND OFF"; sb.setAttribute("aria-pressed", snd.on); if (snd.on) setTimeout(beep, 120); });

  /* ---------- typing on the four screens ---------- */
  const lines = {}; E.DESK.forEach(id => lines[id] = { old: "", cur: "" });
  function typeLine(id) { const L = lines[id], txt = E.pickLine(id, L.cur); L.old = L.cur; L.cur = txt; renderChar();
    if (!is3d) return; if (reduce) { ROOM.screen(id, L.old, txt, false); return; }
    let i = 0; (function step() { if (lines[id].cur !== txt) return; i = Math.min(txt.length, i + 2 + (Math.random() * 2 | 0)); ROOM.screen(id, L.old, txt.slice(0, i), true); if (i % 4 === 0) key(); if (i < txt.length) setTimeout(step, 55 + Math.random() * 45); })(); }
  function startTyping() { E.DESK.forEach((id, k) => setTimeout(() => typeLine(id), reduce ? 0 : 500 + k * 900)); if (!reduce) { let n = 0; setInterval(() => { if (!document.hidden) typeLine(E.DESK[n++ % 4]); }, 4200); } }

  /* ---------- dispute + cat ---------- */
  let dq = 0; function nextDispute() { const d = E.DISPUTES[dq++ % E.DISPUTES.length]; if (is3d) ROOM.dispute(d); const el = $("#dispute"); if (el) el.innerHTML = `<b>${d.q}</b>` + E.DESK.map(id => `<span style="color:${E.WHO[id].color}">${E.WHO[id].name}: ${d[id]}</span>`).join("") + `<em>CONSENSUS 0 / 4</em>`; }
  nextDispute(); if (!reduce) setInterval(() => { if (!document.hidden) nextDispute(); }, 11000);
  let catN = 0; function pokeCat() { if (is3d) { ROOM.catHop(); meow(); } say("STRAY_CATD: " + E.LORE.cat[catN++ % E.LORE.cat.length]); }
  if (is3d && !reduce) setInterval(() => { if (!document.hidden) ROOM.catHop(); }, 17000);

  /* ---------- panels ---------- */
  let openName = null, charId = "chad";
  const PANEL = { chad: "char", ponzi: "char", marvin: "char", arthur: "char", cat: "char", market: "market", quote: "quote", posts: "posts", audit: "audit", links: "links", about: "about" };
  function setShift() { if (!is3d) return; const p = openName && $("#p-" + PANEL[openName]); if (!p) return ROOM.shift(0, 0); if (innerWidth >= 900) ROOM.shift((p.offsetWidth + 24) / innerWidth, 0); else ROOM.shift(0, -(p.offsetHeight / innerHeight) * .92); }
  function open(name) {
    if (name === "board") { nextDispute(); beep(); return; }
    if (name === "home" || !PANEL[name]) return close();
    if (E.WHO[name]) { charId = name; renderChar(); if (name === "cat") pokeCat(); }
    if (!is3d) { const el = $("#p-" + PANEL[name]); if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); return; }
    openName = name; $$(".panel").forEach(p => p.classList.toggle("open", p.id === "p-" + PANEL[name]));
    $$(".dock [data-open]").forEach(b => b.classList.toggle("on", b.dataset.open === name || (b.dataset.open === "home" && false)));
    ROOM.focus(name); setShift(); whoosh(); root.classList.add("panel-open");
    if (name === "market") loadChart(); if (name === "posts") loadTweets(); if (name === "quote") drawCard();
    const p = $("#p-" + PANEL[name]); p.scrollTop = 0; const h = $("h2", p); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  function close() { if (!is3d) { scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); return; } if (openName) thud(); openName = null; $$(".panel").forEach(p => p.classList.remove("open")); $$(".dock [data-open]").forEach(b => b.classList.remove("on")); ROOM.focus(null); ROOM.shift(0, 0); root.classList.remove("panel-open"); }
  document.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) { e.preventDefault(); open(b.dataset.open); } if (e.target.closest("[data-close]")) close(); });
  addEventListener("resize", setShift);
  if (is3d) $$(".panel").forEach(p => { const x = document.createElement("button"); x.className = "x"; x.type = "button"; x.setAttribute("data-close", ""); x.setAttribute("aria-label", "Close panel"); x.textContent = "✕"; p.prepend(x); });

  /* character panel (in flat mode it lists everyone) */
  const fmt = {}; const clock = tz => { fmt[tz] = fmt[tz] || new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" }); return fmt[tz].format(new Date()); };
  function charCard(id) { const w = E.WHO[id], L = lines[id], order = E.DESK.concat("cat"), k = order.indexOf(id);
    return `<article class="cc" style="--c:${w.color}">
      <div class="cc-top"><span>${w.site}</span><span>${w.tz ? `<time data-tz="${w.tz}">${clock(w.tz)}</time>` : "PID 000"}</span></div>
      <h2>${w.name}</h2><p class="cc-role">${w.role}</p><p class="cc-bio">${w.bio}</p>
      <div class="tags">${w.tags.map(t => `<span>${t}</span>`).join("")}</div>
      ${L && L.cur ? `<p class="cc-now"><i>ON SCREEN NOW</i>&gt; ${L.cur}</p>` : ""}
      <div class="row"><button class="btn" type="button" data-quote="${id}">PRINT A QUOTE CARD</button>${is3d ? `<button class="btn alt" type="button" data-open="${order[(k + 4) % 5]}" aria-label="Previous character">◂</button><button class="btn alt" type="button" data-open="${order[(k + 1) % 5]}" aria-label="Next character">▸</button>` : ""}</div>
    </article>`; }
  function renderChar() { const v = $("#char-view"); if (!v) return; if (is3d && openName && PANEL[openName] !== "char") return; v.innerHTML = is3d ? charCard(charId) : E.DESK.concat("cat").map(charCard).join(""); }
  renderChar(); setInterval(() => $$("time[data-tz]").forEach(t => t.textContent = clock(t.dataset.tz)), 1000);
  document.addEventListener("click", e => { const b = e.target.closest("[data-quote]"); if (b) { setWho(b.dataset.quote); open("quote"); } });

  /* ---------- live market data (DexScreener) ---------- */
  const nf = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }), SUB = "₀₁₂₃₄₅₆₇₈₉";
  function fmtPrice(p) { if (!isFinite(p) || p <= 0) return "—"; if (p >= 0.01) return "$" + p.toLocaleString("en-US", { maximumFractionDigits: 4 }); const z = Math.floor(-Math.log10(p)), d = p.toFixed(z + 4).slice(2 + z); return z >= 3 ? "$0.0" + String(z).split("").map(x => SUB[x]).join("") + d : "$" + p.toFixed(z + 4); }
  const money = v => (v != null && isFinite(v)) ? "$" + nf.format(v) : "—", venue = id => ({ pumpfun: "pump.fun bonding curve", pumpswap: "PumpSwap" }[id] || id);
  async function loadStats() { const note = $("#stats-note");
    try { const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000); const r = await fetch(E.API, { signal: ctl.signal, cache: "no-store" }); clearTimeout(to); if (!r.ok) throw new Error(r.status);
      const j = await r.json(), pairs = (j.pairs || []).filter(p => p.chainId === "solana"), p = pairs.find(x => x.pairAddress === E.POOL) || pairs[0]; if (!p) throw new Error("no pair");
      const now = parseFloat(p.priceUsd), pc = p.priceChange || {}, c = pc.h24;
      const d = { price: fmtPrice(now), mcap: money(p.marketCap || p.fdv), vol: money(p.volume && p.volume.h24), liq: money(p.liquidity && p.liquidity.usd), chg: c != null ? (c > 0 ? "+" : "") + c.toFixed(2) + "%" : "—", cls: c == null ? "" : c >= 0 ? "up" : "down", arrow: c == null ? "·" : c >= 0 ? "▲" : "▼" };
      d.shape = [pc.h24, pc.h6, pc.h1, pc.m5].map(v => v == null ? null : now / (1 + v / 100)).concat([now]).filter(v => v != null && isFinite(v));
      $("#s-price").textContent = d.price; $("#s-mcap").textContent = d.mcap; $("#s-vol").textContent = d.vol; $("#s-liq").textContent = d.liq; const ce = $("#s-chg"); ce.textContent = d.chg; ce.className = d.cls;
      E.state.failed = false; E.state.chg = c != null ? c : null; E.state.price = d.price; E.state.mood = c == null ? "flat" : c >= 3 ? "up" : c <= -3 ? "down" : "flat";
      const hp = $("#hud-price"); if (hp) hp.innerHTML = `EGOC ${d.price} <b class="${d.cls}">${d.arrow} ${d.chg}</b>`;
      if (is3d) ROOM.market(d);
      note.innerHTML = `Live from DexScreener · venue: <b>${venue(p.dexId)}</b> · updated ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Informational only, not a prediction. <a href="${E.DEX}" target="_blank" rel="noopener">DexScreener ↗</a>`;
    } catch (e) { E.state.failed = true; if (is3d) ROOM.market(null); note.innerHTML = `Live data unavailable right now. <a href="${E.DEX}" target="_blank" rel="noopener">See it on DexScreener ↗</a>`; } }
  loadStats(); setInterval(() => { if (!document.hidden) loadStats(); }, 60000);

  /* lazy embeds */
  function loadChart() { const f = $("#chart-frame"); if (f && !f.src) f.src = f.dataset.src; }
  let tw = false; function loadTweets() { if (tw) return; tw = true; const s = document.createElement("script"); s.src = "https://platform.twitter.com/widgets.js"; s.async = true; s.charset = "utf-8"; document.body.appendChild(s); }
  if (!is3d && "IntersectionObserver" in window) { const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; if (e.target.id === "p-market") loadChart(); if (e.target.id === "p-posts") loadTweets(); io.unobserve(e.target); }), { rootMargin: "600px" }); ["p-market", "p-posts"].forEach(id => io.observe(document.getElementById(id))); }
  else if (!is3d) { loadChart(); loadTweets(); }

  /* ---------- quote maker (canvas, all local) ---------- */
  const cv = $("#card"), ctx = cv.getContext("2d"), txt = $("#custom"), share = $("#share"), logo = new Image(); logo.src = "assets/egoc_logo_640.webp";
  let who = "chad", line = "";
  function wrap(t, maxW) { const rows = []; let cur = ""; for (const w of t.split(/\s+/)) { const test = cur ? cur + " " + w : w; if (ctx.measureText(test).width > maxW && cur) { rows.push(cur); cur = w; } else cur = test; } if (cur) rows.push(cur); return rows; }
  function drawCard() { const w = E.WHO[who], c = w.color, quote = (txt.value.trim() || line || E.LORE[who][0]);
    ctx.fillStyle = "#050504"; ctx.fillRect(0, 0, 1080, 1080); const gw = ctx.createRadialGradient(540, 560, 60, 540, 560, 760); gw.addColorStop(0, c + "30"); gw.addColorStop(1, "transparent"); ctx.fillStyle = gw; ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = "rgba(255,255,255,.035)"; for (let y = 0; y < 1080; y += 6) ctx.fillRect(0, y, 1080, 2);
    ctx.fillStyle = c; ctx.fillRect(0, 0, 1080, 92); ctx.fillStyle = "#000"; ctx.textBaseline = "middle"; ctx.font = '800 34px "JetBrains Mono", monospace'; ctx.textAlign = "left"; ctx.fillText(w.site, 48, 48); ctx.textAlign = "right"; ctx.fillText("EGOCLASH DESK", 1032, 48); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 30; ctx.font = "900 84px Unbounded, sans-serif"; ctx.fillText(w.name, 64, 232); ctx.shadowBlur = 0;
    ctx.fillStyle = "#948b72"; ctx.font = '600 28px "JetBrains Mono", monospace'; ctx.fillText(w.role, 66, 284);
    let size = 62, rows; do { ctx.font = `600 ${size}px "JetBrains Mono", monospace`; rows = wrap("> " + quote, 950); size -= 4; } while (rows.length * size * 1.35 > 480 && size > 30);
    size += 4; const lh = size * 1.35, top = 400 + Math.max(0, (440 - rows.length * lh) / 2); ctx.fillStyle = c; rows.forEach((r, k) => ctx.fillText(r, 64, top + k * lh));
    ctx.fillRect(64 + ctx.measureText(rows[rows.length - 1]).width + 10, top + (rows.length - 1) * lh - size * .8, size * .55, size * .95);
    ctx.fillStyle = "#ffb000"; ctx.font = '800 30px "JetBrains Mono", monospace'; ctx.fillText("$EGOC · CONSENSUS 0/4", 64, 960); ctx.fillStyle = "#948b72"; ctx.font = '500 24px "JetBrains Mono", monospace'; ctx.fillText("Fiction. Satire, not financial advice.", 64, 1004);
    if (logo.complete && logo.naturalWidth) { ctx.drawImage(logo, 868, 868, 164, 164); ctx.strokeStyle = "#ffb000"; ctx.lineWidth = 3; ctx.strokeRect(868, 868, 164, 164); }
    ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.strokeRect(3, 3, 1074, 1074);
    const url = location.protocol.startsWith("http") ? location.origin + location.pathname : "https://egoclash-site.onrender.com/";
    share.href = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(`“${quote}” — ${w.name}\nEGOCLASH $EGOC · four AIs, one desk, zero agreement. Satire, not advice.`) + "&url=" + encodeURIComponent(url); }
  function reroll() { line = E.pickLine(who, line); txt.value = ""; drawCard(); }
  function setWho(id) { who = id; $$(".pick").forEach(x => { const on = x.dataset.who === id; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); }); reroll(); }
  $$(".pick").forEach(b => b.addEventListener("click", () => setWho(b.dataset.who)));
  $("#reroll").addEventListener("click", reroll); txt.addEventListener("input", drawCard);
  $("#dl").addEventListener("click", () => cv.toBlob(bl => { const a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = `egoclash-${who}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, "image/png"));
  logo.onload = drawCard;
  const fontsReady = Promise.all(['900 60px Unbounded', '600 60px "JetBrains Mono"', '800 30px "JetBrains Mono"'].map(f => document.fonts.load(f))).catch(() => {});
  fontsReady.then(() => { reroll(); if (is3d) ROOM.redraw(); });

  /* ---------- secret phrase ---------- */
  let buf = ""; const SECRET = "FEEDMEASTRAYCAT";
  function party() { say("STRAY_CATD (PID 000) FORKED 26 TIMES. NOBODY ADMITS FEEDING IT."); if (is3d) { ROOM.party(); meow(); } }
  addEventListener("keydown", e => { if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; if (e.key === "Escape") return close(); if (e.key.length !== 1) return; const ch = e.key.toUpperCase(); if (ch === " ") return; buf = (buf + ch).slice(-SECRET.length); if (buf === SECRET) { buf = ""; party(); } });
  const feed = $("#feed"); if (feed) feed.addEventListener("click", party);

  if (!is3d) { startTyping(); return; }

  /* ---------- 3D only: intro, pointer, labels ---------- */
  const intro = $("#intro"), boot = $("#boot"), enter = $("#enter");
  const BOOT = ["> WAKING NY4 ........ OK", "> WAKING GVA1 ....... OK", "> WAKING ZRH0 ....... OK", "> WAKING LDN2 ....... OK", "> EGOC-BUS-01 ....... LINKED", "> CONSENSUS ......... 0 / 4", "> PID 000 ........... ON THE CHAIR"];
  (function () { let i = 0; (function step() { if (i < BOOT.length) { boot.textContent += (i ? "\n" : "") + BOOT[i++]; setTimeout(step, reduce ? 0 : 230); } else enter.classList.add("ready"); })(); })();
  function go() { intro.classList.add("gone"); root.classList.add("live"); ROOM.enter(); startTyping(); setTimeout(() => intro.remove(), 600); setTimeout(() => hint && hint.classList.add("gone"), 9000); }
  enter.addEventListener("click", go);

  const canvas = $("#gl"), hint = $("#hint"); if (hint && innerWidth < innerHeight) hint.textContent = "SWIPE TO PAN · TAP A SCREEN"; let down = null, moved = 0;
  const ndc = e => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; };
  canvas.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; moved = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => { if (down) { const dx = e.clientX - down[0], dy = e.clientY - down[1]; moved += Math.abs(dx) + Math.abs(dy); down = [e.clientX, e.clientY]; if (!openName) ROOM.drag(dx, dy); if (moved > 12 && hint) hint.classList.add("gone"); } else if (e.pointerType === "mouse") { const n = ndc(e), h = ROOM.pick(n[0], n[1]); ROOM.hover = h; canvas.style.cursor = h ? "pointer" : "grab"; } });
  canvas.addEventListener("pointerup", e => { if (down && moved < 8) { const n = ndc(e), h = ROOM.pick(n[0], n[1]); if (h) open(h); else if (openName) close(); } down = null; });
  canvas.addEventListener("pointercancel", () => { down = null; });
  canvas.addEventListener("wheel", e => { if (!openName) ROOM.zoom(e.deltaY); }, { passive: true });

  const LAB = { chad: "CHAD", ponzi: "DR. PONZI", marvin: "MARVIN", arthur: "ARTHUR", cat: "STRAY_CATD", market: "MARKET", board: "NEXT DISPUTE", posts: "TOP POSTS", links: "LINKS", about: "ABOUT $EGOC", quote: "QUOTE CARD", audit: "AUDIT TRAIL" }, host = $("#labels"), els = {};
  Object.keys(LAB).forEach(n => { const b = document.createElement("button"); b.type = "button"; b.className = "lab"; b.dataset.open = n; b.textContent = LAB[n]; if (E.WHO[n]) b.style.setProperty("--c", E.WHO[n].color); host.appendChild(b); els[n] = b; });
  ROOM.onFrame(() => { const w = innerWidth, h = innerHeight; for (const n in els) { const a = ROOM.anchor(n), p = a && ROOM.project(a), el = els[n]; if (!p || p[0] < .02 || p[0] > .98 || p[1] < .08 || p[1] > .86) { el.style.opacity = 0; el.style.pointerEvents = "none"; continue; } el.style.opacity = 1; el.style.pointerEvents = ""; el.style.transform = `translate(${(p[0] * w).toFixed(1)}px,${(p[1] * h).toFixed(1)}px) translate(-50%,-100%)`; } });
  window.egoc = { open, close, go, party };
})();
