// =====================================================================
//  Small WebGL2 renderer: lit/instanced meshes, soft sun shadows,
//  water, billboard particles, fog of war and territory overlays.
// =====================================================================
'use strict';

const LIT_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec3 a_col;
layout(location=3) in vec2 a_uv;
layout(location=4) in vec4 i_m0;
layout(location=5) in vec4 i_m1;
layout(location=6) in vec4 i_m2;
layout(location=7) in vec4 i_m3;
layout(location=8) in vec4 i_tint;
uniform mat4 u_vp, u_lightVP;
uniform float u_time, u_wind;
out vec3 v_wpos; out vec3 v_nrm; out vec3 v_col; out vec2 v_uv; out vec4 v_lpos;
void main() {
  mat4 M = mat4(i_m0, i_m1, i_m2, i_m3);
  vec3 p = a_pos;
  if (u_wind > 0.0) {
    vec3 o = i_m3.xyz;
    float h = max(0.0, a_pos.y);
    float s = sin(u_time * 1.6 + o.x * 0.7 + o.z * 0.45) + 0.5 * sin(u_time * 2.7 + o.z * 1.3);
    p.x += s * 0.12 * h * h * u_wind;
    p.z += cos(u_time * 1.2 + o.x * 0.9) * 0.06 * h * h * u_wind;
  }
  vec4 w = M * vec4(p, 1.0);
  v_wpos = w.xyz;
  v_nrm = mat3(M) * a_nrm;
  v_col = a_col * i_tint.rgb;
  v_uv = a_uv;
  v_lpos = u_lightVP * w;
  gl_Position = u_vp * w;
}`;

const LIT_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 v_wpos; in vec3 v_nrm; in vec3 v_col; in vec2 v_uv; in vec4 v_lpos;
uniform vec3 u_lightDir, u_lightCol, u_sky, u_ground, u_fogCol, u_camPos;
uniform float u_fogNear, u_fogFar, u_spec, u_shin, u_emis, u_alpha, u_cut, u_rim;
uniform sampler2D u_tex; uniform int u_useTex;
uniform sampler2DShadow u_shadow; uniform int u_useShadow; uniform float u_shadowTexel;
uniform sampler2D u_fow; uniform sampler2D u_terr; uniform int u_useMap; uniform vec2 u_mapSize;
out vec4 o;
float shadowF() {
  vec3 p = v_lpos.xyz / v_lpos.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float b = 0.0018, s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(u_shadow, vec3(p.xy + vec2(x, y) * u_shadowTexel * 1.2, p.z - b));
  return s / 9.0;
}
vec3 tonemap(vec3 c) { return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec4 tx = vec4(1.0);
  if (u_useTex == 1) { tx = texture(u_tex, v_uv); if (tx.a < u_cut) discard; }
  vec3 n = normalize(v_nrm);
  if (!gl_FrontFacing) n = -n;
  vec3 base = v_col * tx.rgb;
  float ndl = max(dot(n, u_lightDir), 0.0);
  float sh = (u_useShadow == 1) ? shadowF() : 1.0;
  vec3 hemi = mix(u_ground, u_sky, n.y * 0.5 + 0.5);
  vec3 V = normalize(u_camPos - v_wpos);
  vec3 Hh = normalize(u_lightDir + V);
  float sp = pow(max(dot(n, Hh), 0.0), u_shin) * u_spec * sh * step(0.0, ndl);
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * u_rim;
  vec3 col = base * (hemi + u_lightCol * ndl * sh) + u_lightCol * sp + base * u_emis + u_sky * rim;
  if (u_useMap == 1) {
    vec2 tc = v_wpos.xz / u_mapSize;
    vec4 t = texture(u_terr, tc);
    if (t.a > 0.01) {
      col = mix(col, t.rgb, 0.16);
      float e = 0.0;
      vec2 d = vec2(0.1) / u_mapSize;
      vec4 a1 = texture(u_terr, tc + vec2(d.x, 0.0)), a2 = texture(u_terr, tc - vec2(d.x, 0.0));
      vec4 a3 = texture(u_terr, tc + vec2(0.0, d.y)), a4 = texture(u_terr, tc - vec2(0.0, d.y));
      if (distance(a1, t) > 0.01 || distance(a2, t) > 0.01 || distance(a3, t) > 0.01 || distance(a4, t) > 0.01) e = 1.0;
      col = mix(col, t.rgb * 1.25 + 0.08, e * 0.85);
    }
    float f = texture(u_fow, tc).a;
    col *= 1.0 - f * 0.96;
  }
  float dist = length(u_camPos - v_wpos);
  col = tonemap(col * 1.05);
  col = mix(col, u_fogCol, smoothstep(u_fogNear, u_fogFar, dist));
  o = vec4(col, u_alpha * tx.a);
}`;

const DEPTH_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex; uniform int u_useTex; uniform float u_cut;
in vec2 v_uv;
out vec4 o;
void main() { if (u_useTex == 1 && texture(u_tex, v_uv).a < u_cut) discard; o = vec4(1.0); }`;

const WATER_FS = `#version 300 es
precision highp float;
in vec3 v_wpos; in vec3 v_nrm; in vec3 v_col; in vec2 v_uv; in vec4 v_lpos;
uniform vec3 u_lightDir, u_lightCol, u_sky, u_fogCol, u_camPos;
uniform float u_time, u_fogNear, u_fogFar;
uniform sampler2D u_fow; uniform int u_useMap; uniform vec2 u_mapSize;
out vec4 o;
void main() {
  vec2 p = v_wpos.xz;
  float a = sin(p.x * 3.1 + u_time * 1.3) * 0.5 + sin(p.y * 2.3 - u_time * 1.1) * 0.5 + sin((p.x + p.y) * 5.7 + u_time * 2.1) * 0.25;
  float b = cos(p.y * 3.7 + u_time * 1.2) * 0.5 + cos((p.x - p.y) * 4.3 - u_time * 1.7) * 0.3;
  float wd = length(u_camPos - v_wpos), calm = 1.0 - smoothstep(8.0, 45.0, wd);
  vec3 n = normalize(vec3(a * 0.09 * calm, 1.0, b * 0.09 * calm));
  vec3 V = normalize(u_camPos - v_wpos);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 deep = vec3(0.07, 0.17, 0.22), shallow = vec3(0.18, 0.33, 0.36);
  vec3 col = mix(deep, shallow, 0.5 + a * 0.15);
  col = mix(col, u_sky * 0.8, fres * 0.35);
  vec3 Hh = normalize(u_lightDir + V);
  col += u_lightCol * pow(max(dot(n, Hh), 0.0), 120.0) * 1.4 * (0.3 + 0.7 * calm);
  if (u_useMap == 1) col *= 1.0 - texture(u_fow, v_wpos.xz / u_mapSize).a * 0.96;
  col = mix(col, u_fogCol, smoothstep(u_fogNear, u_fogFar, length(u_camPos - v_wpos)));
  o = vec4(col, 0.72 + fres * 0.25);
}`;

const SPRITE_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=4) in vec4 i_p;
layout(location=5) in vec4 i_c;
uniform mat4 u_vp; uniform vec3 u_right, u_up;
out vec2 v_q; out vec4 v_c;
void main() {
  vec3 w = i_p.xyz + (u_right * a_pos.x + u_up * a_pos.y) * i_p.w;
  v_q = a_pos.xy; v_c = i_c;
  gl_Position = u_vp * vec4(w, 1.0);
}`;
const SPRITE_FS = `#version 300 es
precision mediump float;
in vec2 v_q; in vec4 v_c;
out vec4 o;
void main() { float r = dot(v_q, v_q); if (r > 1.0) discard; float a = (1.0 - r); o = vec4(v_c.rgb, v_c.a * a * a); }`;

const GL3D = {
  ok: false, canvas: null, gl: null, used: false, time: 0,
  settings: { mode3d: true, shadows: true, grass: 1 },

  init() {
    try { const s = JSON.parse(localStorage.getItem('eots_gfx') || 'null'); if (s) Object.assign(this.settings, s); } catch (e) { }
    this.tablet = typeof App !== 'undefined' && !!App.touch;
    const c = document.createElement('canvas');
    c.id = 'gl3d';
    c.style.cssText = 'position:fixed;left:0;top:0;display:none;';
    document.body.insertBefore(c, document.body.firstChild);
    let gl = null;
    try { gl = c.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch (e) { }
    if (!gl) { this.ok = false; return; }
    this.canvas = c; this.gl = gl; this.ok = true;
    this.lit = this.program(LIT_VS, LIT_FS);
    this.depth = this.program(LIT_VS, DEPTH_FS);
    this.water = this.program(LIT_VS, WATER_FS);
    this.sprite = this.program(SPRITE_VS, SPRITE_FS);
    this.instBuf = gl.createBuffer();
    this.instCap = 0;
    this.quad = this.mesh(MeshB.quad());
    this.white = this.texture(null);
    this.initShadow(this.tablet ? 1024 : 2048);
    this.blankMap = this.texture(null);
    c.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
  },
  saveSettings() { try { localStorage.setItem('eots_gfx', JSON.stringify(this.settings)); } catch (e) { } },
  get active() { return this.ok && this.settings.mode3d && !this.lost; },

  program(vs, fs) {
    const gl = this.gl;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  },
  initShadow(size) {
    const gl = this.gl;
    this.shadowSize = size;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  },

  // -------- resources --------
  mesh(d) {
    const gl = this.gl, vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const buf = (loc, data, size) => {
      const b = gl.createBuffer(); bufs.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); return b;
    };
    const n = d.pos.length / 3;
    buf(0, d.pos, 3);
    buf(1, d.nrm || new Float32Array(n * 3).fill(0).map((v, i) => i % 3 === 1 ? 1 : 0), 3);
    buf(2, d.col || new Float32Array(n * 3).fill(1), 3);
    buf(3, d.uv || new Float32Array(n * 2), 2);
    const ib = gl.createBuffer(); bufs.push(ib); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, bufs, count: d.idx.length, bounds: d.bounds };
  },
  texture(src, o = {}) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.texParams(t, src, o);
    return t;
  },
  texParams(t, src, o) {
    const gl = this.gl;
    const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (o.nearest) { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
    else if (src && o.mips !== false) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    } else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); }
  },
  updateTexture(t, src, o = {}) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    this.texParams(t, src, o);
  },
  free(m) {   // release a mesh, texture or instance buffer
    if (!m || !this.ok) return;
    const gl = this.gl;
    if (m instanceof WebGLTexture) { gl.deleteTexture(m); return; }
    if (m.vao) { gl.deleteVertexArray(m.vao); for (const b of m.bufs || []) gl.deleteBuffer(b); m.vao = null; }
    if (m.buf) { gl.deleteBuffer(m.buf); m.buf = null; }
  },
  staticInst(data) {   // a persistent instance buffer (e.g. grass)
    const gl = this.gl, b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf: b, count: data.length / 20 };
  },

  // -------- frame --------
  beginFrame() { this.used = false; this.cleared = false; },
  endFrame() {
    if (!this.ok) return;
    const show = this.used ? 'block' : 'none';
    if (this.canvas.style.display !== show) this.canvas.style.display = show;
  },
  resize(ww, wh, dpr) {
    if (!this.ok) return;
    // tablets: render 3D at a slightly lower resolution to keep it smooth and cool
    if (App.touch) dpr = Math.min(dpr, 1.5);
    this.pr = dpr;
    this.canvas.width = Math.round(ww * dpr); this.canvas.height = Math.round(wh * dpr);
    this.canvas.style.width = ww + 'px'; this.canvas.style.height = wh + 'px';
  },
  // logical rect -> device pixel viewport
  vpRect(r) {
    const pr = this.pr || App.dpr;
    const s = App.scale * pr, ox = App.ox * pr, oy = App.oy * pr;
    const x = Math.round(ox + r.x * s), w = Math.round(r.w * s), h = Math.round(r.h * s);
    const y = Math.round(this.canvas.height - (oy + (r.y + r.h) * s));
    return [x, y, w, h];
  },

  // Render a view: {rect, cam, env, items, sprites, shadow:{c:[x,y,z], r}}
  render(v) {
    const gl = this.gl;
    if (!this.ok) return;
    this.used = true;
    const env = v.env;
    // shadow pass
    let lightVP = M4.ident(), useShadow = 0;
    if (v.shadow && this.settings.shadows) {
      const L = env.lightDir, c = v.shadow.c, r = v.shadow.r;
      const texel = 2 * r / this.shadowSize;
      // stabilise: snap the centre to shadow texels in light space
      const eye = [c[0] + L[0] * 60, c[1] + L[1] * 60, c[2] + L[2] * 60];
      let lv = M4.lookAt(eye, c, [0, 1, 0]);
      const cc = M4.xform(lv, c[0], c[1], c[2]);
      const sx = Math.round(cc[0] / texel) * texel - cc[0], sy = Math.round(cc[1] / texel) * texel - cc[1];
      lightVP = M4.mul(M4.ortho(-r + sx, r + sx, -r + sy, r + sy, 1, 140), lv);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.disable(gl.SCISSOR_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.colorMask(false, false, false, false);
      gl.useProgram(this.depth.p);
      gl.uniformMatrix4fv(this.depth.u.u_vp, false, lightVP);
      gl.uniform1f(this.depth.u.u_time, this.time);
      for (const it of v.items) if (it.shadow !== false && !it.water && !it.alpha) this.drawItem(this.depth, it, true);
      gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      useShadow = 1;
    }
    // main pass
    const [x, y, w, h] = this.vpRect(v.rect);
    gl.viewport(x, y, w, h);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x, y, w, h);
    const cl = env.clear || [0, 0, 0];
    gl.clearColor(cl[0], cl[1], cl[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const cam = v.cam;
    const setCommon = P => {
      gl.useProgram(P.p);
      const u = P.u;
      gl.uniformMatrix4fv(u.u_vp, false, cam.vp);
      if (u.u_lightVP) gl.uniformMatrix4fv(u.u_lightVP, false, lightVP);
      gl.uniform1f(u.u_time, this.time);
      if (u.u_lightDir) gl.uniform3fv(u.u_lightDir, env.lightDir);
      if (u.u_lightCol) gl.uniform3fv(u.u_lightCol, env.lightCol);
      if (u.u_sky) gl.uniform3fv(u.u_sky, env.sky);
      if (u.u_ground) gl.uniform3fv(u.u_ground, env.ground);
      if (u.u_fogCol) gl.uniform3fv(u.u_fogCol, env.fogCol);
      if (u.u_camPos) gl.uniform3fv(u.u_camPos, cam.pos);
      if (u.u_fogNear) { gl.uniform1f(u.u_fogNear, env.fogNear); gl.uniform1f(u.u_fogFar, env.fogFar); }
      if (u.u_shadow) {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
        gl.uniform1i(u.u_shadow, 1); gl.uniform1i(u.u_useShadow, useShadow); gl.uniform1f(u.u_shadowTexel, 1 / this.shadowSize);
      }
      if (u.u_fow) {
        const m = env.map;
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, m ? m.fow : this.blankMap); gl.uniform1i(u.u_fow, 2);
        if (u.u_terr) { gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, m ? m.terr : this.blankMap); gl.uniform1i(u.u_terr, 3); }
        gl.uniform2f(u.u_mapSize, m ? m.w : 1, m ? m.h : 1);
      }
    };
    setCommon(this.lit);
    const opaque = v.items.filter(i => !i.alpha && !i.water), trans = v.items.filter(i => i.alpha && !i.water), water = v.items.filter(i => i.water);
    for (const it of opaque) this.drawItem(this.lit, it, false, env);
    if (water.length) {
      setCommon(this.water);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const it of water) { gl.uniform1i(this.water.u.u_useMap, it.map && env.map ? 1 : 0); this.drawItem(this.water, it, true); }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (trans.length) {
      setCommon(this.lit);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      for (const it of trans) this.drawItem(this.lit, it, false, env);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    if (v.sprites && v.sprites.length) this.drawSprites(v.sprites, cam);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindVertexArray(null);
  },

  drawItem(P, it, depthOnly, env) {
    const gl = this.gl, u = P.u, m = it.mesh;
    if (!m) return;
    if (it.cull === false || it.twoSided) gl.disable(gl.CULL_FACE); else { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); }
    if (u.u_wind) gl.uniform1f(u.u_wind, it.wind || 0);
    if (u.u_useTex) {
      if (it.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, it.tex); gl.uniform1i(u.u_tex, 0); gl.uniform1i(u.u_useTex, 1); }
      else gl.uniform1i(u.u_useTex, 0);
      gl.uniform1f(u.u_cut, it.cut || 0);
    }
    if (!depthOnly) {
      gl.uniform1f(u.u_spec, it.spec ?? 0.1); gl.uniform1f(u.u_shin, it.shin ?? 16);
      gl.uniform1f(u.u_emis, it.emis || 0); gl.uniform1f(u.u_alpha, it.alpha || 1);
      gl.uniform1f(u.u_rim, it.rim || 0);
      gl.uniform1i(u.u_useMap, it.map && env && env.map ? 1 : 0);
    }
    gl.bindVertexArray(m.vao);
    let count = 1;
    if (it.inst) {
      // per-instance data: 16 floats matrix + 4 tint
      if (it.inst.buf) { gl.bindBuffer(gl.ARRAY_BUFFER, it.inst.buf); count = it.inst.count; }
      else {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        const data = it.inst.data; count = it.inst.count;
        if (!count) return;
        const bytes = count * 80;
        if (bytes > this.instCap) { this.instCap = Math.max(bytes, this.instCap * 2); gl.bufferData(gl.ARRAY_BUFFER, this.instCap, gl.DYNAMIC_DRAW); }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 20);
      }
      for (let i = 0; i < 5; i++) {
        gl.enableVertexAttribArray(4 + i);
        gl.vertexAttribPointer(4 + i, 4, gl.FLOAT, false, 80, i * 16);
        gl.vertexAttribDivisor(4 + i, 1);
      }
      gl.drawElementsInstanced(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0, count);
    } else {
      for (let i = 0; i < 5; i++) gl.disableVertexAttribArray(4 + i);
      const M = it.model || IDENT;
      gl.vertexAttrib4f(4, M[0], M[1], M[2], M[3]); gl.vertexAttrib4f(5, M[4], M[5], M[6], M[7]);
      gl.vertexAttrib4f(6, M[8], M[9], M[10], M[11]); gl.vertexAttrib4f(7, M[12], M[13], M[14], M[15]);
      const t = it.tint || [1, 1, 1];
      gl.vertexAttrib4f(8, t[0], t[1], t[2], 1);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
    }
  },

  // sprites: array of [x,y,z,size, r,g,b,a]; additive when s.add
  drawSprites(list, cam) {
    const gl = this.gl, P = this.sprite;
    for (const group of [list.filter(s => !s.add), list.filter(s => s.add)]) {
      if (!group.length) continue;
      const data = new Float32Array(group.length * 8);
      group.forEach((s, i) => data.set(s.v, i * 8));
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.u.u_vp, false, cam.vp);
      const V = cam.view;
      gl.uniform3f(P.u.u_right, V[0], V[4], V[8]); gl.uniform3f(P.u.u_up, V[1], V[5], V[9]);
      gl.enable(gl.BLEND);
      if (group[0].add) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false); gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.quad.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      const bytes = data.byteLength;
      if (bytes > this.instCap) { this.instCap = Math.max(bytes, this.instCap * 2); gl.bufferData(gl.ARRAY_BUFFER, this.instCap, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      for (let i = 0; i < 5; i++) gl.disableVertexAttribArray(4 + i);
      for (let i = 0; i < 2; i++) { gl.enableVertexAttribArray(4 + i); gl.vertexAttribPointer(4 + i, 4, gl.FLOAT, false, 32, i * 16); gl.vertexAttribDivisor(4 + i, 1); }
      gl.drawElementsInstanced(gl.TRIANGLES, this.quad.count, gl.UNSIGNED_INT, 0, group.length);
      gl.depthMask(true); gl.disable(gl.BLEND);
      for (let i = 0; i < 2; i++) gl.vertexAttribDivisor(4 + i, 0);
    }
  },
};
const IDENT = M4.ident();

// Instance list helper: collects matrices + tints for one mesh
class InstList {
  constructor(cap = 64) { this.data = new Float32Array(cap * 20); this.count = 0; }
  reset() { this.count = 0; }
  grow() { const n = new Float32Array(this.data.length * 2); n.set(this.data); this.data = n; }
  // forward/up basis
  push(px, py, pz, fx, fy, fz, ux, uy, uz, s, r = 1, g = 1, b = 1) {
    if ((this.count + 1) * 20 > this.data.length) this.grow();
    const o = this.count * 20;
    M4.basis(this.data, o, px, py, pz, fx, fy, fz, ux, uy, uz, s);
    this.data[o + 16] = r; this.data[o + 17] = g; this.data[o + 18] = b; this.data[o + 19] = 1;
    this.count++;
  }
  pushYaw(px, py, pz, yaw, s, r = 1, g = 1, b = 1, sy) {
    if ((this.count + 1) * 20 > this.data.length) this.grow();
    const o = this.count * 20;
    M4.yaw(this.data, o, px, py, pz, yaw, s, sy ?? s);
    this.data[o + 16] = r; this.data[o + 17] = g; this.data[o + 18] = b; this.data[o + 19] = 1;
    this.count++;
  }
  item(mesh, extra) { return Object.assign({ mesh, inst: { data: this.data, count: this.count } }, extra); }
}
