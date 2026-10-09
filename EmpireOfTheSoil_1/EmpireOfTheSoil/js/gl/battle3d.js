// =====================================================================
//  3D battles, fought on the real campaign terrain
// =====================================================================
'use strict';

BattleScene.prototype.drawWorld3D = function (ctx, dt) {
  const v = this.v3, b = this.b, st = App.st;
  const fort = b.kind === 'nest' || b.kind === 'outpost';
  // arena centre: for sieges, the defenders form up in front of the real mound
  const cx = b.x + 0.5 - (fort ? 4.4 : 0), cz = b.y + 0.5;
  const wx = px => cx + (px - 640) / 100, wz = py => cz + (py - 410) / 100;
  const cam = this.cam3 || (this.cam3 = new OrbitCam());
  cam.tx = cx + (fort ? 0.8 : 0); cam.tz = cz; cam.ty = v.groundAt(cx, cz);
  cam.dist = 8.2 - Math.min(1.2, this.t * 0.12); cam.pitch = 0.62; cam.fov = 0.8;
  cam.yaw = Math.sin(this.t * 0.18) * 0.3; cam.near = 0.1; cam.far = 80;
  this.t3 = (this.t3 || 0) + dt; GL3D.time = this.t3;
  cam.update(W, H);
  const items = [], sprites = [];
  for (const ch of v.chunks) {
    if (ch.x1 < cx - 14 || ch.x0 > cx + 14 || ch.z1 < cz - 12 || ch.z0 > cz + 12) continue;
    items.push({ mesh: ch.mesh, tex: ch.tex, spec: 0.08 });
    for (const d of ch.decor) {
      const it = { mesh: v.decorMesh(d.key), inst: d.inst, spec: 0.06, shin: 20 };
      if (d.key === 'grass' || d.key.startsWith('flower')) { it.wind = 1; it.cull = false; }
      if (d.key === 'leaf') { it.cull = false; it.shadow = false; }
      items.push(it);
    }
  }
  if (v.water) items.push({ mesh: v.water, water: true });
  v.paintStep(8, cx, cz);
  if (fort) {
    const x = b.x + 0.5, z = b.y + 0.5, M = new Float32Array(16);
    M4.yaw(M, 0, x, v.groundAt(x, z) - 0.05, z, 0.4, b.kind === 'nest' ? 1.4 : 0.95);
    items.push({ mesh: Models.get('mound|' + this.D.color + '|' + (b.kind === 'outpost'), () => buildMound(this.D.color, b.kind === 'outpost')), model: M, spec: 0.06 });
  }
  const lists = new Map();
  const add = (sp, caste, fr, x, z, f, up, s, tint) => {
    const key = sp + '|' + caste + '|' + (fr % ANT3D_FRAMES);
    let l = lists.get(key); if (!l) { l = new InstList(64); lists.set(key, l); }
    const y = v.groundAt(x, z);
    l.push(x, y + (up[1] < 0 ? 0.09 * s * 3 : 0), z, f[0], f[1], f[2], up[0], up[1], up[2], s, ...(tint || [1, 1, 1]));
  };
  for (const s of this.sprites) {
    const sp = s.side === 0 ? this.A.species : this.D.species;
    const sc = this.len(s.caste) / 100 * 1.25;
    const f = [Math.cos(s.a), 0, Math.sin(s.a)];
    if (s.alive) add(sp, s.caste, Math.floor(this.t * 16 + s.ph * 3), wx(s.x), wz(s.y), f, [0, 1, 0], sc);
    else add(sp, s.caste, 0, wx(s.x), wz(s.y), f, [0.3, -1, 0], sc, [0.55, 0.5, 0.48]);
  }
  for (const [key, l] of lists) {
    const [sp, caste, fr] = key.split('|');
    items.push(l.item(Models.ant(sp, caste, +fr), { spec: 0.8, shin: 45, rim: 0.25 }));
  }
  for (const p of this.particles) {
    const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(p.col) || [0, 220, 200, 160, 0.6];
    const x = wx(p.x), z = wz(p.y);
    sprites.push({ v: [x, v.groundAt(x, z) + 0.12 + (1 - p.life) * 0.25, z, p.r * 0.022, m[1] / 255, m[2] / 255, m[3] / 255, Math.min(1, p.life * 2) * +m[4]] });
  }
  const E = SEASON_ENV[seasonIdx(st.turn)];
  GL3D.render({ rect: { x: 0, y: 0, w: W, h: H }, cam, items, sprites,
    env: { lightDir: SUN_DIR, lightCol: E.lightCol, sky: E.sky, ground: E.ground, fogCol: E.fog, clear: E.fog, fogNear: 14, fogFar: 32 },
    shadow: { c: [cam.tx, cam.ty, cam.tz], r: 9 } });
  // gentle vignette so the banners read well
  const vg = ctx.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 760);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
};
