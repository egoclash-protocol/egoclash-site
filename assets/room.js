/* EGOCLASH — the desk room. A small hand-written WebGL2 renderer: no libraries.
   Exposes window.ROOM. If WebGL2 is missing, ROOM.ok is false and the page stays a normal document. */
window.ROOM = (function () {
  "use strict";
  const E = window.EGOC, api = { ok: false };
  const canvas = document.getElementById("gl");
  let gl = null;
  try { gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" }); } catch (e) {}
  if (!gl) return api;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- math ---------------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mulS = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix = (a, b, t) => a + (b - a) * t, mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rotY = (v, r) => { const c = Math.cos(r), s = Math.sin(r); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
  function persp(fovy, asp, n, f, sx, sy) { const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16); m[0] = t / asp; m[5] = t; m[8] = sx; m[9] = sy; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
  function lookAt(e, t) { const f = norm(sub(t, e)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f); return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1]); }
  function mul4(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; }
  function trs(p, s, ry, out) { const c = Math.cos(ry), n = Math.sin(ry); out = out || new Float32Array(16); out[0] = s[0] * c; out[1] = 0; out[2] = -s[0] * n; out[3] = 0; out[4] = 0; out[5] = s[1]; out[6] = 0; out[7] = 0; out[8] = s[2] * n; out[9] = 0; out[10] = s[2] * c; out[11] = 0; out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1; return out; }
  const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  /* ---------------- gl helpers ---------------- */
  function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(vs, fs) { const p = gl.createProgram(); gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace("[0]", ""); u[nm] = gl.getUniformLocation(p, nm); } return { p, u }; }

  const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV;
uniform mat4 uM, uVP; uniform vec4 uUV; out vec3 vW; out vec3 vN; out vec2 vUV;
void main(){ vec4 w=uM*vec4(aP,1.); vW=w.xyz; vN=mat3(uM)*aN; vUV=aUV*uUV.xy+uUV.zw; gl_Position=uVP*w; }`;
  const FS = `#version 300 es
precision highp float;
in vec3 vW; in vec3 vN; in vec2 vUV;
uniform vec3 uColor, uEm, uCam, uFog, uAmb; uniform float uAlpha, uSpec, uFogD, uRefl; uniform int uMode;
uniform sampler2D uTex; uniform vec3 uLP[6]; uniform vec3 uLC[6]; out vec4 o;
void main(){
  vec3 n=normalize(vN), v=normalize(uCam-vW); if(dot(n,v)<0.) n=-n;
  vec4 t=vec4(1.); if(uMode>0) t=texture(uTex,vUV);
  vec3 base=uColor; if(uMode==2) base*=t.rgb;
  vec3 lit=base*uAmb, sp=vec3(0.);
  for(int i=0;i<6;i++){ vec3 L=uLP[i]-vW; float att=1./(1.+.2*dot(L,L)); L=normalize(L);
    lit+=base*uLC[i]*(max(dot(n,L),0.)*.85+.15)*att; sp+=uLC[i]*pow(max(dot(n,normalize(L+v)),0.),42.)*att; }
  vec3 em=uEm*(uMode==1?t.rgb:vec3(1.));
  float f=exp(-distance(uCam,vW)*uFogD);
  vec3 c=mix(uFog,lit+sp*uSpec,f)+em*mix(.55,1.,f);
  if(uRefl>0.) c*=exp(vW.y*.75)*uRefl;
  o=vec4(c,uAlpha*(uMode==1?t.a:1.));
}`;
  const PVS = `#version 300 es
out vec2 vUV; void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); vUV=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
  const BRIGHT = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uS; out vec4 o;
void main(){ vec3 c=texture(uS,vUV).rgb; float l=max(c.r,max(c.g,c.b)); o=vec4(c*smoothstep(.55,.95,l),1.); }`;
  const BLUR = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uS; uniform vec2 uD; out vec4 o;
void main(){ vec3 c=texture(uS,vUV).rgb*.227027;
  c+=(texture(uS,vUV+uD*1.3846).rgb+texture(uS,vUV-uD*1.3846).rgb)*.316216;
  c+=(texture(uS,vUV+uD*3.2308).rgb+texture(uS,vUV-uD*3.2308).rgb)*.070270; o=vec4(c,1.); }`;
  const COMP = `#version 300 es
precision highp float; in vec2 vUV; uniform sampler2D uS,uB1,uB2; uniform float uT, uFade; out vec4 o;
void main(){ vec2 d=vUV-.5; float r=dot(d,d);
  vec3 c=vec3(texture(uS,vUV+d*r*.012).r, texture(uS,vUV).g, texture(uS,vUV-d*r*.012).b);
  c+=texture(uB1,vUV).rgb*.8+texture(uB2,vUV).rgb*1.15;
  c*=mix(1.,.42,smoothstep(.12,.62,r));
  float g=fract(sin(dot(gl_FragCoord.xy+uT*60.,vec2(12.9898,78.233)))*43758.5453); c+=(g-.5)*.03;
  c=c/(1.+.1*c)*1.06; o=vec4(c*uFade,1.); }`;
  const DVS = `#version 300 es
layout(location=0) in vec4 aP; uniform mat4 uVP; uniform float uH; out float vA;
void main(){ gl_Position=uVP*vec4(aP.xyz,1.); gl_PointSize=clamp(aP.w*uH/gl_Position.w,1.,14.); vA=clamp(aP.w*9.,.2,1.); }`;
  const DFS = `#version 300 es
precision highp float; in float vA; out vec4 o;
void main(){ float d=length(gl_PointCoord-.5); o=vec4(vec3(1.,.82,.55)*smoothstep(.5,.0,d)*.22*vA,1.); }`;

  let P, PB, PL, PC, PD;
  try { P = program(VS, FS); PB = program(PVS, BRIGHT); PL = program(PVS, BLUR); PC = program(PVS, COMP); PD = program(DVS, DFS); }
  catch (e) { console.warn("EGOCLASH room: shader error", e); return api; }

  /* geometry: unit cube and unit quad (+z) */
  function vao(data) { const v = gl.createVertexArray(); gl.bindVertexArray(v); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24); return { v, n: data.length / 8 }; }
  function face(n, a, b, d) { const out = [], c = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]; for (const [s, t] of c) out.push(n[0] * d + a[0] * s * .5 + b[0] * t * .5, n[1] * d + a[1] * s * .5 + b[1] * t * .5, n[2] * d + a[2] * s * .5 + b[2] * t * .5, n[0], n[1], n[2], (s + 1) / 2, (t + 1) / 2); return out; }
  const CUBE = vao([].concat(face([0, 0, 1], [1, 0, 0], [0, 1, 0], .5), face([0, 0, -1], [-1, 0, 0], [0, 1, 0], .5), face([1, 0, 0], [0, 0, -1], [0, 1, 0], .5), face([-1, 0, 0], [0, 0, 1], [0, 1, 0], .5), face([0, 1, 0], [1, 0, 0], [0, 0, -1], .5), face([0, -1, 0], [1, 0, 0], [0, 0, 1], .5)));
  const QUAD = vao(face([0, 0, 1], [1, 0, 0], [0, 1, 0], 0));

  /* textures from 2D canvases */
  function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function upload(o) { gl.bindTexture(gl.TEXTURE_2D, o.t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, o.cv); const w = o.rep ? gl.REPEAT : gl.CLAMP_TO_EDGE; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); if (o.dyn) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.generateMipmap(gl.TEXTURE_2D); } }
  function tex(w, h, rep) { const o = { t: gl.createTexture(), cv: mkCanvas(w, h), rep: !!rep }; o.g = o.cv.getContext("2d"); return o; }
  const MONO = '"JetBrains Mono", ui-monospace, monospace', DISP = 'Unbounded, "Space Grotesk", sans-serif';
  function wrap(g, t, maxW) { const rows = []; let cur = ""; for (const w of t.split(/\s+/)) { const test = cur ? cur + " " + w : w; if (g.measureText(test).width > maxW && cur) { rows.push(cur); cur = w; } else cur = test; } if (cur) rows.push(cur); return rows; }

  /* ---------------- scene ---------------- */
  const items = [], addi = [], picks = [];
  function item(geo, p, s, ry, o) { const it = Object.assign({ geo, p, s, ry: ry || 0, color: [.05, .05, .06], em: [0, 0, 0], mode: 0, tex: null, uv: [1, 1, 0, 0], alpha: 1, spec: .25, fogD: .026, refl: false, add: false }, o || {}); it.m = trs(p, s, it.ry); (it.add ? addi : items).push(it); return it; }
  const box = (p, s, ry, o) => item(CUBE, p, s, ry, o), quad = (p, s, ry, o) => item(QUAD, p, s, ry, o);
  const AMBER = hex("#ffb000"), DARK = [.035, .035, .045];
  /* Layout: a row of four on wide screens; on a portrait phone the four monitors stack 2x2 on a shelf so all fit. */
  const PORT = innerWidth / innerHeight < .8;
  const MX = PORT ? [-1.2, 1.2, -1.2, 1.2] : [-3.75, -1.25, 1.25, 3.75], MZ = PORT ? [-.2, -.2, .15, .15] : [.38, 0, 0, .38], MRY = PORT ? [.1, -.1, .1, -.1] : [.22, .07, -.07, -.22];
  const MY = PORT ? [1.52, 1.52, 0, 0] : [0, 0, 0, 0], HY = PORT ? 5.05 : 3.72;
  const CX = PORT ? [-2.3, -.8, .8, 2.3] : [-3.6, -1.35, 1.3, 3.8], CZ = [2.55, 2.4, 2.5, 2.35], CRY = [.3, -.12, .16, -.34];
  const FX = PORT ? [-3.6, -1.2, 1.2, 3.6] : [-5.1, -1.75, 1.75, 5.1];
  const COL = E.DESK.map(id => hex(E.WHO[id].color));

  /* sky + skyline */
  const skyT = tex(8, 256); (function () { const g = skyT.g, gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "#030208"); gr.addColorStop(.5, "#0d0722"); gr.addColorStop(.8, "#2a1038"); gr.addColorStop(.93, "#7a2a1c"); gr.addColorStop(1, "#ff8a2a"); g.fillStyle = gr; g.fillRect(0, 0, 8, 256); upload(skyT); })();
  quad([0, 26, -70], [220, 70, 1], 0, { mode: 1, tex: skyT, em: [.55, .55, .55], fogD: 0, color: [0, 0, 0] });
  const winT = tex(128, 256, true); (function () { const g = winT.g; g.fillStyle = "#020203"; g.fillRect(0, 0, 128, 256); for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { const r = rnd(); if (r > .52) { g.fillStyle = r > .93 ? "#bfe9ff" : r > .7 ? "#ffd9a0" : "#8a6a3a"; g.fillRect(x * 16 + 4, y * 16 + 5, 8, 7); } } upload(winT); })();
  const beacons = [];
  for (let i = 0; i < 54; i++) { const far = rnd(), x = (rnd() - .5) * 78, z = -13 - far * 34, w = 2.2 + rnd() * 3.6, h = 5 + rnd() * 9 + far * 16, d = 2 + rnd() * 3; const warm = rnd(); box([x, h / 2 - 3, z], [w, h, d], rnd() * .3, { mode: 1, tex: winT, uv: [Math.round(w / 1.6) / 2, Math.round(h / 2.4) / 2, Math.floor(rnd() * 8) / 8, Math.floor(rnd() * 16) / 16], em: warm > .5 ? [.95, .72, .45] : [.55, .7, 1], color: [.01, .01, .015], fogD: .016 }); if (rnd() > .7) beacons.push(box([x, h - 2.8, z], [.25, .25, .25], 0, { em: [1.6, .1, .1], fogD: .01 })); }

  /* shell: floor, wall with windows, ceiling */
  const floor = box([0, -.06, 1], [30, .12, 30], 0, { color: [.028, .028, .036], spec: 1.15 });
  box([0, 5.95, -7.1], [30, 1.7, .5], 0, { color: DARK });
  box([0, .25, -7.1], [30, .5, .4], 0, { color: DARK });
  for (let x = -13.5; x <= 13.5; x += 3) box([x, 2.8, -7.05], [.14, 4.7, .2], 0, { color: [.02, .02, .03] });
  box([-11.5, 3.3, 2], [.4, 7, 30], 0, { color: DARK }); box([11.5, 3.3, 2], [.4, 7, 30], 0, { color: DARK });
  box([0, 6.9, 2], [24, .3, 30], 0, { color: [.02, .02, .025] });
  for (const x of [-4.2, 4.2]) box([x, 6.72, .4], [.12, .04, 9], 0, { em: [.5, .32, .08], color: [0, 0, 0] });

  /* ticker band above the windows */
  const tickT = tex(2048, 64, true);
  const ticker = quad([0, 5.95, -6.83], [11, .5, 1], 0, { mode: 1, tex: tickT, em: [1.2, 1.2, 1.2], uv: [.69, 1, 0, 0], refl: true, color: [0, 0, 0] });
  function drawTicker(d) { const g = tickT.g; g.fillStyle = "#040302"; g.fillRect(0, 0, 2048, 64); g.font = "700 34px " + MONO; g.textBaseline = "middle"; let x = 20; const seg = (t, c) => { g.fillStyle = c; g.fillText(t, x, 34); x += g.measureText(t).width + 46; };
    const gags = ["FEED ME A STRAY CAT", "04:12", "FOR THE RECORD", "CONSENSUS 0/4", "CHAIRS ARE FREE", "NOT FINANCIAL ADVICE"]; let k = 0;
    while (x < 1900) { if (d) { seg("EGOC " + d.price, "#ffb000"); seg(d.arrow + " " + d.chg + " 24H", d.cls === "down" ? "#ff4d6a" : "#39ff8f"); if (x < 1500) { seg("MCAP " + d.mcap, "#ffb000"); seg("VOL " + d.vol, "#ffb000"); } } else seg(api.failed ? "EGOC FEED OFFLINE" : "EGOC FEED CONNECTING", "#ffb000"); seg(gags[k++ % gags.length], "#8a7f66"); }
    upload(tickT); }

  /* mainframes + cables (the bus) */
  const ledT = tex(64, 256, true); ledT.dyn = true; const leds = [];
  function drawLeds() { const g = ledT.g; g.fillStyle = "#000"; g.fillRect(0, 0, 64, 256); for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) { const r = Math.random(); if (r > .45) { g.fillStyle = r > .9 ? "#fff" : r > .7 ? "#bbb" : "#555"; g.fillRect(x * 8 + 2, y * 8 + 2, 4, 3); } } upload(ledT); }
  drawLeds();
  const cables = [];
  FX.forEach((x, i) => { const c = COL[i];
    box([x, 1.9, -4.7], [1.7, 3.8, 1.25], 0, { color: [.03, .03, .04], spec: .5 });
    leds.push(quad([x, 2.0, -4.07], [1.25, 3.0, 1], 0, { mode: 1, tex: ledT, em: mulS(c, 1.15), uv: [1, 1, i * .13, i * .31], refl: true, color: [0, 0, 0] }));
    box([x, 3.72, -4.06], [1.7, .07, .05], 0, { em: mulS(c, 1.5), refl: true });
    const a = [x, .04, -4.0], b = [MX[i], .04, MZ[i] - 1.0], ctl = [(x + MX[i]) / 2 + (i - 1.5) * .5, .04, -2.3]; let prev = a;
    for (let k = 1; k <= 9; k++) { const t = k / 9, q = [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * ctl[0] + t * t * b[0], .04, (1 - t) * (1 - t) * a[2] + 2 * (1 - t) * t * ctl[2] + t * t * b[2]]; const dx = q[0] - prev[0], dz = q[2] - prev[2]; cables.push({ it: box([(q[0] + prev[0]) / 2, .04, (q[2] + prev[2]) / 2], [.06, .06, Math.hypot(dx, dz) + .03], Math.atan2(dx, dz), { em: mulS(c, .5) }), c, k: k + i * 3 }); prev = q; }
    cables.push({ it: box([b[0], .5, b[2]], [.06, .95, .06], 0, { em: mulS(c, .5) }), c, k: 10 + i * 3 });
  });

  /* the desk */
  box([0, .91, .25], [10.9, .08, 1.9], 0, { color: [.07, .055, .04], spec: .7 });
  box([-5.3, .45, .25], [.1, .9, 1.8], 0, { color: DARK }); box([5.3, .45, .25], [.1, .9, 1.8], 0, { color: DARK }); box([0, .5, -.6], [10.6, .75, .06], 0, { color: DARK });
  box([0, .87, 1.21], [10.9, .025, .025], 0, { em: mulS(AMBER, .7), refl: true });
  box([-2.55, 1.03, 1.0], [.13, .17, .13], 0, { color: [.34, .34, .36] }); box([-.15, .975, 1.0], [.3, .05, .4], .2, { color: [.36, .36, .34] });
  box([2.3, 1.01, .95], [.3, .12, .4], -.15, { color: [.32, .32, .3] }); box([4.75, .975, 1.05], [.3, .04, .42], .35, { color: [.38, .33, .2] });

  /* monitors */
  const mon = {}, lights = [];
  if (PORT) { box([0, 2.46, -.2], [5.0, .06, 1.35], 0, { color: [.07, .055, .04], spec: .7 }); box([-2.46, 1.7, -.2], [.08, 1.5, 1.25], 0, { color: DARK }); box([2.46, 1.7, -.2], [.08, 1.5, 1.25], 0, { color: DARK }); }
  E.DESK.forEach((id, i) => { const c = COL[i], ry = MRY[i], base = [MX[i], MY[i], MZ[i]], by = MY[i];
    box([base[0], 1.0 + by, base[2]], [.55, .1, .55], ry, { color: DARK });
    const body = box([base[0], 1.72 + by, base[2] - .1], [1.74, 1.34, 1.15], ry, { color: [.11, .1, .09], spec: .6 });
    const sp = add([base[0], 1.74 + by, base[2] - .1], rotY([0, 0, .582], ry));
    const t = tex(512, 372); t.dyn = true;
    const scr = quad(sp, [1.48, 1.07, 1], ry, { mode: 1, tex: t, em: [.9, .9, .9], refl: true, color: [0, 0, 0] });
    box(add([base[0], 1.13 + by, base[2] - .1], rotY([.7, 0, .58], ry)), [.05, .03, .02], ry, { em: mulS(c, 2) });
    if (!by) box(add(base, rotY([0, .97, .98], ry)), [.95, .04, .33], ry, { color: [.06, .06, .07], spec: .6 });
    mon[id] = { i, c, body, scr, t, old: "", cur: "", flash: 0, hover: 0 };
    lights.push({ p: add([base[0], 1.75 + by, base[2]], rotY([0, 0, 1.25], ry)), c });
    picks.push({ name: id, c: [base[0], 1.72 + by, base[2]], r: .98 });
  });
  lights.push({ p: [0, 3.5, .4], c: mulS(AMBER, .55) }); lights.push({ p: [0, 3.2, -6.2], c: [.28, .16, .5] });

  const fmt = {};
  function clock(tz) { fmt[tz] = fmt[tz] || new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" }); return fmt[tz].format(new Date()); }
  function drawScreen(id) { const m = mon[id], w = E.WHO[id], g = m.t.g, c = w.color; g.setTransform(.8, 0, 0, .8017, 0, 0);
    g.fillStyle = "#020403"; g.fillRect(0, 0, 640, 464);
    const gl2 = g.createRadialGradient(320, 250, 30, 320, 250, 420); gl2.addColorStop(0, c + "2e"); gl2.addColorStop(1, "transparent"); g.fillStyle = gl2; g.fillRect(0, 0, 640, 464);
    g.fillStyle = c; g.fillRect(0, 0, 640, 54); g.fillStyle = "#000"; g.textBaseline = "middle"; g.font = "800 28px " + MONO; g.textAlign = "left"; g.fillText(w.site, 22, 28); g.textAlign = "right"; g.fillText(clock(w.tz), 618, 28); g.textAlign = "left";
    g.textBaseline = "alphabetic"; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 10; g.font = "900 62px " + DISP; g.fillText(w.name, 24, 134); g.shadowBlur = 0;
    g.fillStyle = "#8f8870"; g.font = "600 21px " + MONO; g.fillText(w.role, 26, 166);
    g.font = "700 30px " + MONO; let y = 226;
    if (m.old) { g.fillStyle = c + "66"; for (const r of wrap(g, "> " + m.old, 590).slice(0, 2)) { g.fillText(r, 24, y); y += 38; } y += 8; }
    g.fillStyle = c; const rows = wrap(g, "> " + m.cur, 590).slice(0, 5); rows.forEach(r => { g.fillText(r, 24, y); y += 38; });
    if (Math.floor(performance.now() / 500) % 2 === 0 || reduce) { const lw = rows.length ? g.measureText(rows[rows.length - 1]).width : 0; g.fillRect(24 + lw + 6, y - 38 - 25, 16, 30); }
    g.fillStyle = "rgba(0,0,0,.28)"; for (let s = 0; s < 464; s += 4) g.fillRect(0, s, 640, 1);
    upload(m.t); }

  /* chairs + cat */
  CX.forEach((x, j) => { const ry = CRY[j], P = l => add([x, 0, CZ[j]], rotY(l, ry)), o = { color: [.045, .045, .06], spec: .5 };
    box(P([0, .55, 0]), [.64, .08, .62], ry, o); box(P([0, 1.02, .31]), [.6, .72, .07], ry, o); box(P([0, .3, 0]), [.08, .5, .08], ry, o); box(P([0, .05, 0]), [.52, .05, .52], ry, o); });
  const catDef = [[[0, .16, 0], [.27, .32, .3], 0], [[0, .42, .07], [.25, .22, .22], 0], [[-.085, .57, .07], [.07, .1, .05], 0], [[.085, .57, .07], [.07, .1, .05], 0], [[.17, .05, -.12], [.05, .05, .32], 0], [[-.058, .44, .186], [.05, .032, .01], 1], [[.058, .44, .186], [.05, .032, .01], 1]];
  const cat = { chair: 0, from: 0, t: 1, pos: [CX[0], .59, CZ[0]], ry: .25, parts: catDef.map(d => box([0, 0, 0], d[1], 0, d[2] ? { em: [.3, 2.2, .9] } : { color: [.03, .03, .04], em: [.07, .012, .075], spec: 1 })) };
  const catPick = { name: "cat", c: [0, 0, 0], r: .7 }; picks.push(catPick);
  function placeCat(parts, pos, ry, sc) { parts.forEach((it, k) => { const d = catDef[k]; trs(add(pos, rotY(mulS(d[0], sc), ry)), mulS(d[1], sc), ry, it.m); }); }
  api.catHop = function () { if (cat.t < 1) return cat.chair; cat.from = cat.chair; cat.chair = (cat.chair + 1 + ((Math.random() * 3) | 0)) % 4; cat.t = 0; return cat.chair; };

  /* hologram (market), dispute board, 04:12 clock */
  const holoT = tex(1024, 512);
  const holo = quad([0, HY, -1.0], [3.1, 1.55, 1], 0, { mode: 1, tex: holoT, em: [1.0, 1.0, 1.0], add: true, blend: 1, refl: false, color: [0, 0, 0] });
  picks.push({ name: "market", c: [0, HY, -1.0], r: 1.05 });
  function drawHolo(d) { const g = holoT.g; g.clearRect(0, 0, 1024, 512); g.fillStyle = "rgba(6,4,2,.66)"; g.fillRect(0, 0, 1024, 512); g.strokeStyle = "#ffb000"; g.lineWidth = 4; const br = (x, y, sx, sy) => { g.beginPath(); g.moveTo(x, y + 46 * sy); g.lineTo(x, y); g.lineTo(x + 46 * sx, y); g.stroke(); }; br(14, 14, 1, 1); br(1010, 14, -1, 1); br(14, 498, 1, -1); br(1010, 498, -1, -1);
    
    g.textBaseline = "alphabetic"; g.fillStyle = "#ffb000"; g.font = "800 30px " + MONO; g.fillText("EGOC / USD · LIVE", 48, 74);
    if (!d) { g.font = "800 56px " + MONO; g.fillText(api.failed ? "FEED OFFLINE" : "FEED CONNECTING…", 48, 270); upload(holoT); return; }
    g.fillStyle = "#fff"; g.font = "900 104px " + DISP; g.fillText(d.price, 44, 196);
    const up = d.cls !== "down", col = up ? "#39ff8f" : "#ff4d6a"; g.fillStyle = col; g.font = "800 50px " + MONO; g.fillText(d.arrow + " " + d.chg + " · 24H", 48, 268);
    if (d.shape && d.shape.length > 2) { const mn = Math.min(...d.shape), mx = Math.max(...d.shape), sp = (mx - mn) || 1, n = d.shape.length; const pt = k => [60 + k / (n - 1) * 900, 440 - (d.shape[k] - mn) / sp * 120];
      g.beginPath(); d.shape.forEach((v, k) => { const p = pt(k); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.strokeStyle = col; g.lineWidth = 7; g.lineJoin = "round"; g.shadowColor = col; g.shadowBlur = 18; g.stroke(); g.shadowBlur = 0;
      g.lineTo(960, 470); g.lineTo(60, 470); g.closePath(); g.fillStyle = up ? "rgba(57,255,143,.14)" : "rgba(255,77,106,.14)"; g.fill(); }
    g.fillStyle = "#b9a56c"; g.font = "600 22px " + MONO; g.textAlign = "right"; g.fillText("MCAP " + d.mcap + " · VOL " + d.vol + " · LIQ " + d.liq, 980, 74); g.fillText("24H SHAPE · SOURCE DEXSCREENER · NOT A PREDICTION", 980, 492); g.textAlign = "left";
    upload(holoT); }

  const boardT = tex(768, 512), BP = [-7.4, 3.7, -5.6], BRY = .5;
  box(add(BP, rotY([0, 0, -.06], BRY)), [3.75, 2.55, .08], BRY, { color: DARK });
  quad(BP, [3.6, 2.4, 1], BRY, { mode: 1, tex: boardT, em: [.95, .95, .95], refl: true, color: [0, 0, 0] });
  picks.push({ name: "board", c: BP, r: 1.5 });
  function drawBoard(d) { const g = boardT.g; g.fillStyle = "#050504"; g.fillRect(0, 0, 768, 512); g.textBaseline = "alphabetic";
    g.fillStyle = "#ffb000"; g.fillRect(0, 0, 768, 58); g.fillStyle = "#000"; g.font = "800 28px " + MONO; g.fillText("TODAY'S DISPUTE", 24, 40);
    g.fillStyle = "#fff"; g.font = "900 44px " + DISP; let y = 128; for (const r of wrap(g, d.q, 720)) { g.fillText(r, 24, y); y += 52; }
    g.font = "600 23px " + MONO; y = Math.max(y + 14, 232); E.DESK.forEach(id => { g.fillStyle = E.WHO[id].color; const rows = wrap(g, E.WHO[id].name + ": " + d[id], 720).slice(0, 2); rows.forEach(r => { g.fillText(r, 24, y); y += 30; }); y += 6; });
    g.fillStyle = "#ff4d6a"; g.fillRect(24, 444, 300, 48); g.fillStyle = "#000"; g.font = "800 26px " + MONO; g.fillText("CONSENSUS 0 / 4", 40, 477); upload(boardT); }
  const clockT = tex(512, 256), KP = [-7.4, 5.45, -5.6];
  quad(KP, [1.7, .85, 1], BRY, { mode: 1, tex: clockT, em: [1.05, 1.05, 1.05], refl: true, color: [0, 0, 0] });
  const PP = [7.4, 3.7, -5.6], postsT = tex(768, 512);
  box(add(PP, rotY([0, 0, -.06], -BRY)), [3.75, 2.55, .08], -BRY, { color: DARK });
  quad(PP, [3.6, 2.4, 1], -BRY, { mode: 1, tex: postsT, em: [.95, .95, .95], refl: true, color: [0, 0, 0] });
  picks.push({ name: "posts", c: PP, r: 1.5 });
  function drawPosts() { const g = postsT.g; g.fillStyle = "#04060a"; g.fillRect(0, 0, 768, 512); g.textBaseline = "alphabetic"; g.fillStyle = "#4da3ff"; g.fillRect(0, 0, 768, 58); g.fillStyle = "#000"; g.font = "800 28px " + MONO; g.fillText("TOP POSTS · @EgoClash_EGOC", 24, 40);
    g.fillStyle = "#4da3ff"; g.font = "800 26px " + MONO; g.fillText("DR. PONZI", 24, 112); g.fillStyle = "#e8e2d0"; g.font = "600 27px " + MONO; let y = 158;
    for (const r of ["1,000 people who believe in a coin", "make a market.", "100 who stay after a bad day", "make a community.", "I lost my chair trying."]) { g.fillText(r, 24, y); y += 38; }
    g.fillStyle = "#4da3ff"; g.fillRect(24, 444, 250, 48); g.fillStyle = "#000"; g.font = "800 26px " + MONO; g.fillText("READ THE DESK", 40, 477); upload(postsT); }
  const LP2 = [7.4, 5.45, -5.6], linksT = tex(512, 256);
  quad(LP2, [1.7, .85, 1], -BRY, { mode: 1, tex: linksT, em: [1.05, 1.05, 1.05], refl: true, color: [0, 0, 0] });
  picks.push({ name: "links", c: LP2, r: .9 });
  function drawLinks() { const g = linksT.g; g.fillStyle = "#020703"; g.fillRect(0, 0, 512, 256); g.strokeStyle = "#39ff8f"; g.lineWidth = 8; g.strokeRect(14, 14, 484, 228); g.fillStyle = "#39ff8f"; g.shadowColor = "#39ff8f"; g.shadowBlur = 22; g.textAlign = "center"; g.font = "900 104px " + DISP; g.fillText("LINKS", 256, 150); g.shadowBlur = 0; g.font = "700 24px " + MONO; g.fillText("EVERY DOOR TO THE DESK", 256, 208); g.textAlign = "left"; upload(linksT); }
  /* the logo, made real: an arcade cabinet (about) */
  const AP = [-6.9, 0, -2.4], ARY = .55, logoT = tex(512, 512);
  box(add(AP, [0, 1.15, 0]), [1.2, 2.3, 1.0], ARY, { color: [.5, .2, .03], em: [.07, .028, 0], spec: .6 });
  box(add(AP, rotY([0, 2.2, .51], ARY)), [1.2, .2, .03], ARY, { em: mulS(AMBER, 1.2), refl: true });
  quad(add(AP, rotY([0, 1.45, .512], ARY)), [.98, .98, 1], ARY, { mode: 1, tex: logoT, em: [1, 1, 1], refl: true, color: [0, 0, 0] });
  box(add(AP, rotY([0, .78, .58], ARY)), [1.2, .08, .32], ARY, { color: [.3, .12, .02] });
  picks.push({ name: "about", c: add(AP, [0, 1.3, 0]), r: 1.15 });
  function drawLogo(img) { const g = logoT.g; g.fillStyle = "#0a0420"; g.fillRect(0, 0, 512, 512); if (img) g.drawImage(img, 0, 0, 512, 512); else { g.fillStyle = "#ffb000"; g.textAlign = "center"; g.font = "900 96px " + DISP; g.fillText("$EGOC", 256, 280); g.textAlign = "left"; } upload(logoT); }
  (function () { const im = new Image(); im.onload = () => drawLogo(im); im.src = "assets/egoc_logo_640.webp"; })();
  /* the printer (quote cards) */
  const QP = [6.9, 0, -2.4], QRY = -.55, cardT = tex(256, 320);
  box(add(QP, [0, .45, 0]), [.95, .9, .75], QRY, { color: DARK, spec: .5 });
  box(add(QP, [0, 1.08, 0]), [1.1, .36, .85], QRY, { color: [.2, .2, .22], spec: .7 });
  box(add(QP, rotY([.38, 1.12, .43], QRY)), [.08, .04, .02], QRY, { em: [.3, 2, .8] });
  quad(add(QP, rotY([0, 1.78, .05], QRY)), [.84, 1.05, 1], QRY, { mode: 1, tex: cardT, em: [.95, .95, .95], refl: true, color: [0, 0, 0] });
  picks.push({ name: "quote", c: add(QP, [0, 1.5, 0]), r: 1.0 });
  function drawCardT() { const g = cardT.g; g.fillStyle = "#070706"; g.fillRect(0, 0, 256, 320); g.fillStyle = "#39ff8f"; g.fillRect(0, 0, 256, 30); g.font = "900 30px " + DISP; g.fillText("CHAD", 14, 78); g.font = "700 17px " + MONO; ["> IT IS 04:12.", "> IT IS ALWAYS", "  04:12."].forEach((r, k) => g.fillText(r, 14, 124 + k * 26)); g.fillStyle = "#ffb000"; g.font = "800 15px " + MONO; g.fillText("$EGOC · QUOTE CARD", 14, 296); g.strokeStyle = "#39ff8f"; g.lineWidth = 4; g.strokeRect(2, 2, 252, 316); upload(cardT); }
  function drawClock() { const g = clockT.g; g.fillStyle = "#070202"; g.fillRect(0, 0, 512, 256); g.fillStyle = "#ff3a3a"; g.shadowColor = "#ff3a3a"; g.shadowBlur = 26; g.textAlign = "center"; g.font = "900 138px " + DISP; g.fillText("04:12", 256, 168); g.shadowBlur = 0; g.fillStyle = "#a66"; g.font = "700 22px " + MONO; g.fillText("CHAD STANDARD TIME", 256, 226); g.textAlign = "left"; upload(clockT); }
  picks.push({ name: "audit", c: [5.1, 2.4, -4.6], r: 1.3 }); picks.push({ name: "audit", c: [-5.1, 2.4, -4.6], r: 1.3 });

  /* dust */
  const NP = 240, dust = new Float32Array(NP * 4); for (let i = 0; i < NP; i++) { dust[i * 4] = (rnd() - .5) * 18; dust[i * 4 + 1] = rnd() * 6; dust[i * 4 + 2] = -6 + rnd() * 14; dust[i * 4 + 3] = .02 + rnd() * .05; }
  const dVao = gl.createVertexArray(), dBuf = gl.createBuffer(); gl.bindVertexArray(dVao); gl.bindBuffer(gl.ARRAY_BUFFER, dBuf); gl.bufferData(gl.ARRAY_BUFFER, dust, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);

  /* cat rain (easter egg) */
  const rain = [];
  api.party = function () { if (reduce) return; for (let i = 0; i < 26; i++) rain.push({ p: [(Math.random() - .5) * 11, 6.5 + Math.random() * 7, -2 + Math.random() * 5.5], v: 2.5 + Math.random() * 2.5, ry: Math.random() * 6, sp: (Math.random() - .5) * 5, sc: 1 + Math.random() * .9, parts: catDef.map(d => ({ geo: CUBE, m: new Float32Array(16), color: [.012, .012, .016], em: d[2] ? [.3, 2.2, .9] : [.12, .02, .11], mode: 0, uv: [1, 1, 0, 0], alpha: 1, spec: .9, fogD: .026 })) }); api.partyT = 5; };
  api.partyT = 0;

  /* ---------------- framebuffers ---------------- */
  let W = 2, H = 2, dpr = 1, fb = {}; api.q = 1;
  function target(w, h) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return { f, t, w, h }; }
  function resize() {
    const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5) * api.q;
    const w = Math.max(2, Math.round(cw * dpr)), h = Math.max(2, Math.round(ch * dpr)); if (w === W && h === H && fb.scene) return; W = w; H = h; canvas.width = W; canvas.height = H;
    for (const k in fb) { const o = fb[k]; if (o.t) gl.deleteTexture(o.t); if (o.f) gl.deleteFramebuffer(o.f); if (o.rbs) o.rbs.forEach(r => gl.deleteRenderbuffer(r)); }
    const samples = Math.min(cw < 700 || api.q < 1 ? 2 : 4, gl.getParameter(gl.MAX_SAMPLES) || 0), ms = { f: gl.createFramebuffer(), rbs: [gl.createRenderbuffer(), gl.createRenderbuffer()] };
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms.f); gl.bindRenderbuffer(gl.RENDERBUFFER, ms.rbs[0]); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, ms.rbs[0]);
    gl.bindRenderbuffer(gl.RENDERBUFFER, ms.rbs[1]); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ms.rbs[1]);
    const h2 = [Math.max(2, W >> 1), Math.max(2, H >> 1)], h4 = [Math.max(2, W >> 2), Math.max(2, H >> 2)];
    fb = { ms, scene: target(W, H), a: target(h2[0], h2[1]), b: target(h2[0], h2[1]), c: target(h4[0], h4[1]), d: target(h4[0], h4[1]) };
  }

  /* ---------------- camera ---------------- */
  const cam = { pos: [0, 10, 30], tgt: [0, 6, -20], fov: .7, sx: 0, sy: 0, gsx: 0, gsy: 0, yaw: 0, pitch: 0, pan: 0, zoom: 1, focus: null, started: false, fade: 0 };
  let VP = new Float32Array(16), aspect = 1, tanH = .4;
  const portrait = () => aspect < .85;
  function focusGoal(name) {
    if (mon[name]) { const i = mon[name].i; return { pos: add([MX[i], 1.9 + MY[i], MZ[i]], rotY([0, .25, 4.5], MRY[i] * .6)), tgt: [MX[i], 1.72 + MY[i], MZ[i]] }; }
    if (name === "cat") return { pos: add(cat.pos, [.5, .95, 2.3]), tgt: add(cat.pos, [0, .3, 0]) };
    if (name === "market") return { pos: [0, HY - .6, 4.6], tgt: [0, HY, -1.0] };
    if (name === "posts") return { pos: [3.0, 3.3, 1.4], tgt: PP };
    if (name === "audit") return { pos: [0, 4.7, 2.6], tgt: [0, 1.9, -4.7] };
    if (name === "board") return { pos: [-3.0, 3.3, 1.4], tgt: BP };
    if (name === "about") return { pos: [-5.0, 2.1, 2.6], tgt: add(AP, [0, 1.35, 0]) };
    if (name === "quote") return { pos: [5.0, 2.1, 2.6], tgt: add(QP, [0, 1.45, 0]) };
    if (name === "links") return { pos: [2.8, 4.0, 1.6], tgt: LP2 };
    return null; }
  function camGoal(t) {
    const p = portrait(); let g = cam.focus && focusGoal(cam.focus);
    if (!cam.started) return { pos: [Math.sin(t * .1) * 2, 9.5, 27], tgt: [0, 6.5, -20], fov: .75 };
    if (g) { if (p) g.pos = add(g.tgt, mulS(sub(g.pos, g.tgt), 1.5)); g.fov = p ? .95 : .72; return g; }
    const sway = reduce ? 0 : Math.sin(t * .23) * .12, z = (PORT ? 9.6 : 10.3) * cam.zoom, yaw = cam.yaw + sway * .25;
    const tgt = [cam.pan * .75, (PORT ? 2.75 : 2.05) - cam.pitch * .6, 0], off = rotY([0, (PORT ? .5 : 1.0) + cam.pitch * 5, z], yaw);
    return { pos: [tgt[0] * .7 + off[0] + cam.pan * .3, tgt[1] + off[1], off[2]], tgt, fov: p ? 1.06 : .71 }; }

  /* ---------------- frame ---------------- */
  const LP = new Float32Array(18), LC = new Float32Array(18), mir = new Float32Array(16);
  let last = performance.now(), T = 0, secT = 0, ledT2 = 0, frames = 0, ema = .016; const hooks = [];
  function drawItem(it, refl) { const u = P.u; let m = it.m; if (refl) { mir.set(m); mir[1] = -m[1]; mir[5] = -m[5]; mir[9] = -m[9]; mir[13] = -m[13]; m = mir; }
    gl.uniformMatrix4fv(u.uM, false, m); gl.uniform3fv(u.uColor, it.color); gl.uniform3fv(u.uEm, it.em); gl.uniform4fv(u.uUV, it.uv); gl.uniform1f(u.uAlpha, refl ? .34 : it.alpha); gl.uniform1f(u.uSpec, it.spec); gl.uniform1f(u.uFogD, it.fogD); gl.uniform1i(u.uMode, it.mode); gl.uniform1f(u.uRefl, refl ? 1 : 0);
    if (it.tex) gl.bindTexture(gl.TEXTURE_2D, it.tex.t); gl.bindVertexArray(it.geo.v); gl.drawArrays(gl.TRIANGLES, 0, it.geo.n); }
  function pass(prog, src, dst, set) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H); gl.useProgram(prog.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(prog.u.uS, 0); if (set) set(prog.u); gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3); }

  function frame(now) {
    requestAnimationFrame(frame); if (document.hidden) { last = now; return; }
    const rawDt = (now - last) / 1000, dt = Math.min(.05, rawDt); last = now; T += dt; resize(); aspect = W / H;
    if (cam.started) cam.fade = Math.min(1, cam.fade + dt * .9); else cam.fade = Math.min(.55, cam.fade + dt * .5);
    frames++; ema = ema * .93 + rawDt * .07; if (cam.started && frames % 50 === 0 && frames > 60 && ema > .024 && api.q > .55) { api.q = Math.max(.55, api.q - .15); ema = .016; }

    /* animate */
    secT += dt; if (secT > 1) { secT = 0; E.DESK.forEach(drawScreen); }
    ledT2 += dt; if (ledT2 > .7) { ledT2 = 0; drawLeds(); }
    ticker.uv[2] = (T * .018) % 1;
    beacons.forEach((b, k) => { const on = Math.sin(T * 2 + k) > .2 ? 1.6 : .1; b.em[0] = on; });
    cables.forEach(c => { const p = .35 + .65 * Math.max(0, Math.sin(T * 3.2 - c.k * .7)); c.it.em = mulS(c.c, p * .75); });
    holo.p[1] = HY + Math.sin(T * .9) * .05; trs(holo.p, holo.s, Math.sin(T * .35) * .12, holo.m);
    if (cat.t < 1) { cat.t = Math.min(1, cat.t + dt / .85); const a = [CX[cat.from], .59, CZ[cat.from]], b = [CX[cat.chair], .59, CZ[cat.chair]], e = cat.t * cat.t * (3 - 2 * cat.t); cat.pos = mix3(a, b, e); cat.pos[1] += Math.sin(Math.PI * cat.t) * 1.0; cat.ry = mix(cat.ry, CRY[cat.chair] * .5, .1) + (1 - cat.t) * .25; }
    placeCat(cat.parts, cat.pos, cat.ry + Math.sin(T * .7) * .08, 1.5); catPick.c = add(cat.pos, [0, .45, 0]);
    for (let i = rain.length - 1; i >= 0; i--) { const r = rain[i]; r.p[1] -= r.v * dt; r.ry += r.sp * dt; if (r.p[1] < -1) { rain.splice(i, 1); continue; } placeCat(r.parts, r.p, r.ry, r.sc); }
    if (api.partyT > 0) api.partyT -= dt;
    for (let i = 0; i < NP; i++) { dust[i * 4 + 1] += dt * .06; dust[i * 4] += Math.sin(T * .3 + i) * dt * .03; if (dust[i * 4 + 1] > 6.2) dust[i * 4 + 1] = 0; }

    /* camera */
    const g = camGoal(T), k = api._snap ? 1 : 1 - Math.exp(-dt * (cam.started ? (cam.fly > 0 ? 2.2 : 7) : 1)); cam.fly = Math.max(0, (cam.fly || 0) - dt); if (api._snap) { cam.fade = 1; api._snap = false; }
    cam.pos = mix3(cam.pos, g.pos, k); cam.tgt = mix3(cam.tgt, g.tgt, k); cam.fov = mix(cam.fov, g.fov, k); cam.sx = mix(cam.sx, cam.gsx, k); cam.sy = mix(cam.sy, cam.gsy, k);
    tanH = Math.tan(cam.fov / 2); VP = mul4(persp(cam.fov, aspect, .1, 200, cam.sx, cam.sy), lookAt(cam.pos, cam.tgt));

    /* lights */
    const party = api.partyT > 0;
    lights.forEach((l, i) => { let c = l.c, s = 1; if (i < 4) { const m = mon[E.DESK[i]]; m.flash = Math.max(0, m.flash - dt * 3); m.hover = mix(m.hover, api.hover === E.DESK[i] ? 1 : 0, .15); s = 1.25 + m.flash * .9 + m.hover * .7 + Math.sin(T * 1.7 + i * 2) * .08; m.body.em = mulS(m.c, .02 + m.hover * .1); }
      else if (i === 5 && E.state.mood !== "flat") c = E.state.mood === "up" ? [.1, .42, .24] : [.5, .1, .16];
      if (party) { c = [1, .2, .9]; s *= 1.2 + Math.sin(T * 18 + i) * .5; }
      LP.set(l.p, i * 3); LC[i * 3] = c[0] * s; LC[i * 3 + 1] = c[1] * s; LC[i * 3 + 2] = c[2] * s; });

    /* scene */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.ms.f); gl.viewport(0, 0, W, H); gl.clearColor(.012, .008, .025, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(P.p); const u = P.u; gl.uniformMatrix4fv(u.uVP, false, VP); gl.uniform3fv(u.uCam, cam.pos); gl.uniform3f(u.uFog, .014, .01, .03); gl.uniform3f(u.uAmb, .05, .05, .075); gl.uniform3fv(u.uLP, LP); gl.uniform3fv(u.uLC, LC); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.uTex, 0);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true); drawItem(floor);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); for (const it of items) if (it.refl) drawItem(it, true); drawItem(holo, true);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); for (const it of items) if (it !== floor) drawItem(it); for (const r of rain) for (const it of r.parts) drawItem(it);
    gl.enable(gl.BLEND); gl.depthMask(false); for (const it of addi) { if (it.blend) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE); drawItem(it); }
    gl.useProgram(PD.p); gl.uniformMatrix4fv(PD.u.uVP, false, VP); gl.uniform1f(PD.u.uH, H); gl.bindVertexArray(dVao); gl.bindBuffer(gl.ARRAY_BUFFER, dBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dust); gl.blendFunc(gl.ONE, gl.ONE); gl.drawArrays(gl.POINTS, 0, NP);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

    /* post */
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb.ms.f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fb.scene.f); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    pass(PB, fb.scene, fb.a); pass(PL, fb.a, fb.b, q => gl.uniform2f(q.uD, 1 / fb.a.w, 0)); pass(PL, fb.b, fb.a, q => gl.uniform2f(q.uD, 0, 1 / fb.a.h));
    pass(PL, fb.a, fb.c, q => gl.uniform2f(q.uD, 2 / fb.c.w, 0)); pass(PL, fb.c, fb.d, q => gl.uniform2f(q.uD, 0, 2 / fb.c.h)); 
    pass(PC, fb.scene, null, q => { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, fb.a.t); gl.uniform1i(q.uB1, 1); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, fb.d.t); gl.uniform1i(q.uB2, 2); gl.uniform1f(q.uT, T % 10); gl.uniform1f(q.uFade, cam.fade); gl.activeTexture(gl.TEXTURE0); });
    for (const h of hooks) h(T);
  }

  /* ---------------- public api ---------------- */
  api.ok = true; api.hover = null; api.failed = false;
  api.onFrame = f => hooks.push(f);
  api.enter = () => { cam.started = true; cam.fly = 1.6; };
  api.snap = () => { api._snap = true; };
  api.focus = name => { cam.focus = name || null; };
  api.shift = (sx, sy) => { cam.gsx = sx; cam.gsy = sy; };
  api.drag = (dx, dy) => { if (portrait()) cam.pan = clamp(cam.pan - dx * .014, -6.4, 6.4); else cam.yaw = clamp(cam.yaw - dx * .0022, -.5, .5); cam.pitch = clamp(cam.pitch + dy * .0008, -.05, .16); };
  api.zoom = d => { cam.zoom = clamp(cam.zoom + d * .0006, .72, 1.25); };
  api.panTo = x => { cam.pan = clamp(x, -3.9, 3.9); };
  api.screen = (id, old, cur, flash) => { const m = mon[id]; if (!m) return; m.old = old; m.cur = cur; if (flash) m.flash = Math.min(1, m.flash + .35); drawScreen(id); };
  api.market = d => { api._d = d; api.failed = !d; drawTicker(d); drawHolo(d); };
  api.dispute = d => { api._q = d; drawBoard(d); };
  api.anchor = name => { if (mon[name]) { const i = mon[name].i; return [MX[i], PORT && !MY[i] ? 1.0 : 2.52 + MY[i], MZ[i] + (PORT && !MY[i] ? .5 : 0)]; } if (name === "cat") return add(cat.pos, [0, 1.12, 0]); if (name === "market") return [0, HY + .9, -1.0]; if (name === "board") return add(BP, [0, -.82, 0]); if (name === "posts") return add(PP, [0, -.82, 0]); if (name === "links") return add(LP2, [0, .62, 0]); if (name === "about") return add(AP, [0, 2.62, 0]); if (name === "quote") return add(QP, [0, 2.5, 0]); if (name === "audit") return [5.1, 4.0, -4.5]; return null; };
  api.project = p => { const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15]; return w <= .1 ? null : [(x / w * .5 + .5), (1 - (y / w * .5 + .5))]; };
  api.pick = (nx, ny) => { const f = norm(sub(cam.tgt, cam.pos)), r = norm(cross(f, [0, 1, 0])), up = cross(r, f); const d = norm(add(add(f, mulS(r, (nx + cam.sx) * tanH * aspect)), mulS(up, (ny + cam.sy) * tanH))); let best = null, bt = 1e9;
    for (const s of picks) { const oc = sub(s.c, cam.pos), tc = dot(oc, d); if (tc < 0) continue; const d2 = dot(oc, oc) - tc * tc; if (d2 < s.r * s.r && tc < bt) { bt = tc; best = s.name; } } return best; };
  api.redraw = () => { E.DESK.forEach(drawScreen); drawClock(); drawPosts(); drawLinks(); drawCardT(); drawTicker(api._d || null); drawHolo(api._d || null); drawBoard(api._q || E.DISPUTES[0]); };

  drawClock(); drawPosts(); drawLinks(); drawCardT(); drawLogo(null); drawTicker(null); drawHolo(null); drawBoard(E.DISPUTES[0]); E.DESK.forEach(drawScreen); resize();
  addEventListener("resize", () => { if ((innerWidth / innerHeight < .8) !== PORT) location.reload(); else resize(); });
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); document.documentElement.classList.remove("is3d"); });
  requestAnimationFrame(frame);
  return api;
})();
