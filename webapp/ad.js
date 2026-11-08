/* MeatCity — (1) tepadagi banner: kolbasa kesish animatsiyasi (Three.js)
              (2) mahsulot rasmi bosilganda: qisqa ovozsiz reklama (Canvas 2D) */
(function () {
  const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
  window.LOW_END = LOW;
  const $ = (s, r = document) => r.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - Math.pow(1 - t, 3), easeIn = t => t * t, easeIO = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const spring = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

  /* ============================================================ 1) BANNER: kolbasa kesish */
  function textures() {
    // kolbasa po'sti (yon tomoni) + brend belbog'i
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#a8321f'); grd.addColorStop(.5, '#8e2517'); grd.addColorStop(1, '#6d1a10');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '40,10,5' : '230,150,110'},${rnd(.03, .1)})`; g.fillRect(rnd(0, 512), rnd(0, 256), rnd(1, 22), rnd(1, 2)); }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 150, 512, 8);
    g.fillStyle = '#f4efe6'; g.fillRect(0, 96, 512, 64);                       // belbog' (aylana bo'ylab)
    g.fillStyle = '#c4121f'; g.fillRect(0, 96, 512, 6); g.fillRect(0, 154, 512, 6);
    g.fillStyle = '#c4121f'; g.font = 'italic 800 42px Georgia,serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    for (let k = 0; k < 4; k++) g.fillText('M/S', 64 + k * 128, 130);
    const side = new THREE.CanvasTexture(c); side.wrapS = THREE.RepeatWrapping; side.encoding = THREE.sRGBEncoding;

    // kesim yuzasi (kolbasa ichi): pushti go'sht + oq yog' bo'lakchalari + murch
    const s = document.createElement('canvas'); s.width = s.height = 256; const h = s.getContext('2d');
    h.fillStyle = '#5a1a10'; h.beginPath(); h.arc(128, 128, 126, 0, 7); h.fill();
    const rg = h.createRadialGradient(110, 100, 10, 128, 128, 120); rg.addColorStop(0, '#e8a29c'); rg.addColorStop(1, '#c97671');
    h.fillStyle = rg; h.beginPath(); h.arc(128, 128, 118, 0, 7); h.fill();
    h.save(); h.beginPath(); h.arc(128, 128, 118, 0, 7); h.clip();
    for (let i = 0; i < 230; i++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * 118;
      h.fillStyle = `rgba(250,236,222,${rnd(.55, .95)})`; h.beginPath(); h.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, rnd(2, 6), rnd(1.5, 4.5), rnd(0, 3), 0, 7); h.fill(); }
    for (let i = 0; i < 160; i++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * 118;
      h.fillStyle = `rgba(80,30,25,${rnd(.25, .6)})`; h.fillRect(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, rnd(1, 2.4), rnd(1, 2.4)); }
    h.restore();
    const cut = new THREE.CanvasTexture(s); cut.encoding = THREE.sRGBEncoding;

    // yog'och taxta
    const w = document.createElement('canvas'); w.width = 512; w.height = 512; const q = w.getContext('2d');
    q.fillStyle = '#9a6a3c'; q.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 70; i++) { q.strokeStyle = `rgba(${Math.random() < .5 ? '60,35,15' : '200,150,90'},${rnd(.08, .22)})`; q.lineWidth = rnd(1, 4); q.beginPath(); const y = rnd(0, 512); q.moveTo(0, y); q.bezierCurveTo(170, y + rnd(-14, 14), 340, y + rnd(-14, 14), 512, y + rnd(-6, 6)); q.stroke(); }
    const wood = new THREE.CanvasTexture(w); wood.encoding = THREE.sRGBEncoding;
    return { side, cut, wood };
  }

  window.createBanner = function (canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LOW ? 1 : 1.5)); renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 2.6, 0.1, 50);
    cam.position.set(1.4, 1.6, 8.6); cam.lookAt(.5, -.15, 0);
    scene.add(new THREE.AmbientLight(0xffffff, .55));
    const key = new THREE.DirectionalLight(0xfff1dd, .8); key.position.set(3, 6, 5); scene.add(key);
    const rim = new THREE.PointLight(0x5eead4, .8, 18); rim.position.set(-4, 2, 3); scene.add(rim);
    const T = textures();

    const R = .68, SL = .2, CUT_X = -1.0, L = 11;
    const casing = new THREE.MeshStandardMaterial({ map: T.side, roughness: .42, metalness: .05 });
    const face = new THREE.MeshStandardMaterial({ map: T.cut, roughness: .7 });
    const sausage = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, LOW ? 24 : 40, 1), [casing, face, face]);
    sausage.rotation.z = -Math.PI / 2; sausage.position.set(CUT_X - L / 2 - .01, .62, 0); scene.add(sausage);

    const board = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, .14, 48), new THREE.MeshStandardMaterial({ map: T.wood, roughness: .8 }));
    board.position.set(4.1, -1.15, .2); scene.add(board);

    // pichoq (po'lat tig' + qora dasta)
    const knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.035, 1.8, 1.7), new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: .9, roughness: .18 }));
    const spine = new THREE.Mesh(new THREE.BoxGeometry(.07, .12, 1.5), new THREE.MeshStandardMaterial({ color: 0x9aa4aa, metalness: .9, roughness: .3 })); spine.position.y = .8;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(.16, .22, .85), new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: .5 })); handle.position.set(0, .95, -.95);
    knife.add(blade, spine, handle); knife.position.set(CUT_X + .02, 2.4, 0); scene.add(knife);

    // bo'laklar (pool)
    const sliceGeo = new THREE.CylinderGeometry(R * .995, R * .995, SL, LOW ? 22 : 36, 1);
    const SLOTS = 8, STEP = .5, SX = 2.0;
    const slices = []; let spawned = 0; const slotOwner = new Array(SLOTS).fill(null);
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2));
    function spawn() {
      const slot = spawned % SLOTS; spawned++;
      const m = new THREE.Mesh(sliceGeo, [casing, face, face]); scene.add(m);
      const lean = new THREE.Euler(rnd(1.0, 1.22), rnd(-.18, .18), rnd(-.2, .2));
      const s = { m, t0: clock, slot, from: new THREE.Vector3(CUT_X + SL / 2, .62, 0), to: new THREE.Vector3(SX + slot * STEP, -.78 + slot * .004, .25 + slot * .03), q1: new THREE.Quaternion().setFromEuler(lean), dying: -1 };
      if (slotOwner[slot]) slotOwner[slot].dying = clock;
      slotOwner[slot] = s; slices.push(s);
    }

    let clock = 0, last = performance.now(), running = true, lastCutPhase = 1, acc = 0;
    const P = 1.55;
    function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    addEventListener('resize', resize); resize();
    const FRAME = LOW ? 1 / 24 : 1 / 40;
    (function loop(t) {
      if (!running) return; requestAnimationFrame(loop);
      if (document.hidden) { last = t; return; }
      acc += (t - last) / 1000; last = t; if (acc < FRAME) return;
      const dt = Math.min(acc, .08); acc = 0; clock += dt;
      const u = (clock % P) / P;
      // pichoq: tepadan pastga (kesish) va yuqoriga
      let ky;
      if (u < .24) ky = 2.4 - (2.4 - .55) * easeIn(u / .24); else if (u < .5) ky = .55 + (2.4 - .55) * easeOut((u - .24) / .26); else ky = 2.4;
      knife.position.y = ky;
      const phase = u < .24 ? 0 : 1;
      if (phase === 1 && lastCutPhase === 0) spawn();
      lastCutPhase = phase;
      sausage.position.x = CUT_X - L / 2 - .01 + (u > .24 && u < .5 ? 0 : 0);
      sausage.rotation.x += dt * .02;
      // bo'laklar: uchib borib taxtada saf tortadi
      for (let i = slices.length - 1; i >= 0; i--) {
        const s = slices[i], k = clamp((clock - s.t0) / .75);
        const e = easeOut(k);
        s.m.position.lerpVectors(s.from, s.to, e); s.m.position.y += Math.sin(Math.PI * k) * .85;
        s.m.quaternion.slerpQuaternions(q0, s.q1, easeIO(k));
        if (s.dying >= 0) { const d = clamp((clock - s.dying) / .4); s.m.scale.setScalar(1 - easeIn(d)); s.m.position.y += d * .3; if (d >= 1) { scene.remove(s.m); slices.splice(i, 1); } }
      }
      rim.intensity = .8 + Math.sin(clock * 2) * .2;
      renderer.render(scene, cam);
    })(performance.now());
    return { setProgress() {}, stop() { running = false; removeEventListener('resize', resize); renderer.dispose(); } };
  };

  /* ============================================================ 2) MAHSULOT REKLAMASI (ovozsiz) */
  function loadImg(url) {
    return new Promise(res => {
      const a = new Image(); a.crossOrigin = 'anonymous';
      a.onload = () => res({ im: a, cors: true });
      a.onerror = () => { const b = new Image(); b.onload = () => res({ im: b, cors: false }); b.onerror = () => res(null); b.src = url; };
      a.src = url;
    });
  }
  // oq fonni olib tashlaydi (chetdan boshlab to'ldirish), mahsulotni kesib oladi
  function cutout(im, cors) {
    const MAX = LOW ? 380 : 520, sc = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(2, Math.round(im.naturalWidth * sc)), h = Math.max(2, Math.round(im.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h);
    const out = { canvas: c, w, h, mode: 'photo', color: [30, 90, 70] };
    if (!cors) return out;
    let d; try { d = g.getImageData(0, 0, w, h); } catch (e) { return out; }
    const px = d.data, bg = new Uint8Array(w * h), stack = [];
    const isW = i => px[i * 4] > 226 && px[i * 4 + 1] > 226 && px[i * 4 + 2] > 226 || px[i * 4 + 3] < 12;
    const push = i => { if (!bg[i] && isW(i)) { bg[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) { const i = stack.pop(), x = i % w, y = (i / w) | 0; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); }
    let n = 0; for (let i = 0; i < bg.length; i++) n += bg[i];
    if (n / bg.length < .12) return out;                        // fon oq emas — to'rtburchak foto ko'rinishida
    let r = 0, gg = 0, b = 0, cnt = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) { px[i * 4 + 3] = 0; continue; }
      if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) px[i * 4 + 3] = 150;   // chetini yumshatish
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      const R = px[i * 4], G = px[i * 4 + 1], B = px[i * 4 + 2];
      if (!(R > 200 && G > 200 && B > 200)) { r += R; gg += G; b += B; cnt++; }
    }
    g.putImageData(d, 0, 0);
    if (x1 <= x0 || y1 <= y0) return out;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
    c2.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
    return { canvas: c2, w: cw, h: ch, mode: 'cut', color: cnt ? [r / cnt | 0, gg / cnt | 0, b / cnt | 0] : out.color };
  }
  function avgColor(canvas) {
    try { const s = document.createElement('canvas'); s.width = s.height = 8; const g = s.getContext('2d'); g.drawImage(canvas, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return [r / n | 0, gg / n | 0, b / n | 0]; } catch (e) { return [30, 90, 70]; }
  }
  const mix = (c, k, t) => c.map((v, i) => Math.round(v * (1 - t) + k[i] * t));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  window.openAd = async function (p, onAdd) {
    if (!p.image) return;
    const root = document.createElement('div'); root.id = 'ad';
    root.innerHTML = '<canvas></canvas><button class="ad-x" aria-label="Yopish">✕</button><div class="ad-bar"><button class="btn ad-add">🛒 Savatga qo\'shish</button></div>';
    document.body.appendChild(root); requestAnimationFrame(() => root.classList.add('on'));
    const cv = $('canvas', root), g = cv.getContext('2d');
    const DPR = Math.min(devicePixelRatio || 1, LOW ? 1.25 : 2);
    function size() { cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; }
    size();
    let alive = true, raf = 0;
    const close = () => { if (!alive) return; alive = false; cancelAnimationFrame(raf); root.classList.remove('on'); setTimeout(() => root.remove(), 350); if (window.__adBack) window.__adBack(); };
    $('.ad-x', root).onclick = close;
    $('.ad-add', root).onclick = () => { onAdd && onAdd(); close(); };
    window.__adClose = close;

    const loaded = await loadImg(p.image);
    if (!alive) return;
    if (!loaded) { close(); return; }
    const ci = cutout(loaded.im, loaded.cors);
    const dom = ci.mode === 'cut' ? ci.color : avgColor(ci.canvas);
    const bgc = mix(dom, [8, 16, 14], .78), bgc2 = mix(dom, [0, 0, 0], .9), glow = mix(dom, [255, 255, 255], .25);
    const N = 8, dust = Array.from({ length: LOW ? 14 : 30 }, () => ({ x: Math.random(), y: Math.random(), s: rnd(.6, 2.2), v: rnd(.02, .07), p: Math.random() * 6 }));
    const LOOP = 7.2, t0 = performance.now();
    const label = p.name.length > 46 ? p.name.slice(0, 44) + '…' : p.name;
    const price = Math.round(p.price).toLocaleString('ru-RU').replace(/,/g, ' ') + " so'm";

    function wrap(text, maxW, font) {
      g.font = font; const words = text.split(' '), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur); return lines.slice(0, 3);
    }

    function frame(now) {
      if (!alive) return; raf = requestAnimationFrame(frame);
      const W = cv.width, H = cv.height, u = DPR, tt = ((now - t0) / 1000) % LOOP;
      g.setTransform(1, 0, 0, 1, 0, 0);
      // fon: mahsulot rangiga mos
      const bgG = g.createLinearGradient(0, 0, 0, H); bgG.addColorStop(0, rgb(bgc)); bgG.addColorStop(1, rgb(bgc2)); g.fillStyle = bgG; g.fillRect(0, 0, W, H);
      const gx = W * (.5 + Math.sin(tt * .9) * .18), gy = H * (.42 + Math.cos(tt * .7) * .06);
      const rg = g.createRadialGradient(gx, gy, 0, gx, gy, W * .9); rg.addColorStop(0, rgb(glow, .38)); rg.addColorStop(1, rgb(glow, 0)); g.fillStyle = rg; g.fillRect(0, 0, W, H);
      for (const d of dust) { d.y -= d.v * .016; if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); } g.fillStyle = `rgba(255,255,255,${.12 + .12 * Math.sin(tt * 2 + d.p)})`; g.beginPath(); g.arc(d.x * W, d.y * H, d.s * u, 0, 7); g.fill(); }

      // mahsulot o'lchami va joyi
      const maxW = W * .78, maxH = H * .42, sc = Math.min(maxW / ci.w, maxH / ci.h), iw = ci.w * sc, ih = ci.h * sc;
      const cx = W / 2, cy = H * .47, bottom = cy + ih / 2;
      // lavha (soya)
      const plate = g.createRadialGradient(cx, bottom, 0, cx, bottom, iw * .75);
      plate.addColorStop(0, 'rgba(0,0,0,.45)'); plate.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(0, 0); g.scale(1, .22); g.fillStyle = plate; g.beginPath(); g.arc(cx, bottom / .22 + 8 * u, iw * .75, 0, 7); g.fill(); g.restore();

      // bosqichlar
      const appear = easeOut(clamp(tt / 1.0));
      const sep = easeIO(clamp((tt - 1.5) / .9));          // kesilib ajraladi
      const fan = easeIO(clamp((tt - 2.6) / 1.5));         // yelpig'ichdek taxlanadi
      const back = easeIO(clamp((tt - 6.2) / .9));         // yig'iladi
      const f = fan * (1 - back), s2 = sep * (1 - back);
      const bob = Math.sin(tt * 1.6) * 5 * u;
      g.globalAlpha = appear * (1 - clamp((tt - 6.9) / .3) * 0);
      const sw = iw / N, srcW = ci.w / N;
      const order = [...Array(N).keys()];
      for (const i of order) {
        const mid = i - (N - 1) / 2;
        const offX = mid * sw * (1 + s2 * .18 - f * .5) * (1 - .16 * f);
        const ang = mid * .17 * f;
        const lift = (Math.abs(mid) * 3 * s2) * u * (i % 2 ? 1 : -1) * (1 - f);
        g.save();
        g.translate(cx + offX, bottom + bob + lift + (1 - appear) * 60 * u);
        g.rotate(ang);
        g.scale((.55 + .45 * appear) * (1 - .14 * f), (.55 + .45 * appear) * (1 - .14 * f));
        g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 14 * u * (.3 + s2); g.shadowOffsetY = 5 * u;
        if (ci.mode === 'photo') { const r = 10 * u; g.beginPath(); g.rect(-sw / 2, -ih, sw + 1, ih); g.clip(); }
        g.drawImage(ci.canvas, i * srcW, 0, srcW + 1, ci.h, -sw / 2, -ih, sw + 1, ih);
        g.restore();
        // kesim chizig'i (yaltirash)
        if (s2 > .02 && s2 < .98 && i > 0) { g.save(); g.globalAlpha = (1 - s2) * .9; g.fillStyle = '#fff'; g.fillRect(cx + (mid - .5) * sw * (1 + s2 * .22) - u, bottom - ih, 2 * u, ih); g.restore(); }
      }
      g.globalAlpha = 1;
      // pichoq yaltirashi (o'tib ketuvchi nur)
      const kt = clamp((tt - 1.15) / .55);
      if (kt > 0 && kt < 1) {
        const kx = cx - iw / 2 - 60 * u + (iw + 120 * u) * easeIO(kt);
        g.save(); g.globalAlpha = .85 * Math.sin(Math.PI * kt); const kg = g.createLinearGradient(kx - 40 * u, 0, kx + 40 * u, 0);
        kg.addColorStop(0, 'rgba(255,255,255,0)'); kg.addColorStop(.5, 'rgba(255,255,255,.95)'); kg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = kg; g.translate(0, 0); g.transform(1, 0, -.35, 1, 0, 0); g.fillRect(kx - 40 * u + (bottom - ih / 2) * .35, bottom - ih - 20 * u, 80 * u, ih + 40 * u); g.restore();
      }
      // yuqori chap: brend
      g.save(); g.globalAlpha = clamp(tt / .6);
      const lr = 22 * u; g.fillStyle = '#c4121f'; g.beginPath(); g.arc(34 * u + lr / 2, 74 * u, lr, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `italic 700 ${26 * u}px Georgia,serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('mc', 34 * u + lr / 2, 76 * u);
      g.textAlign = 'left'; g.font = `800 ${17 * u}px system-ui,sans-serif`; g.fillStyle = '#fff'; g.fillText('MeatCity', 34 * u + lr * 1.9, 70 * u);
      g.font = `600 ${12 * u}px system-ui,sans-serif`; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('Jizzax', 34 * u + lr * 1.9, 88 * u); g.restore();
      // nom va narx
      const ta = easeOut(clamp((tt - 3.9) / .7)) * (1 - back);
      const ty = H * .72;
      g.save(); g.globalAlpha = ta; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
      const fs = 24 * u, lines = wrap(label, W * .84, `800 ${fs}px system-ui,sans-serif`);
      g.font = `800 ${fs}px system-ui,sans-serif`; g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10 * u;
      lines.forEach((ln, i) => g.fillText(ln, cx, ty + (1 - ta) * 20 * u + i * fs * 1.2));
      g.restore();
      const pa = clamp((tt - 4.3) / .6), pe = spring(pa) * (1 - back);
      if (pa > 0) {
        const pw = 210 * u, ph = 54 * u, py = ty + lines.length * fs * 1.2 + 26 * u;
        g.save(); g.translate(cx, py + ph / 2); g.scale(Math.max(.01, pe), Math.max(.01, pe));
        g.shadowColor = 'rgba(239,43,61,.6)'; g.shadowBlur = 24 * u; const bg2 = g.createLinearGradient(-pw / 2, 0, pw / 2, 0); bg2.addColorStop(0, '#ef2b3d'); bg2.addColorStop(1, '#a90f1d');
        g.fillStyle = bg2; g.beginPath(); g.roundRect ? g.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2) : g.rect(-pw / 2, -ph / 2, pw, ph); g.fill();
        g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = `800 ${26 * u}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(price, 0, 2 * u); g.restore();
      }
      // yulduzchalar (kesilganda)
      if (tt > 1.5 && tt < 2.8) { g.save(); for (let k = 0; k < 10; k++) { const a = k * .63 + tt * 2, r = (tt - 1.5) * 90 * u * (1 + k % 3 * .3); g.globalAlpha = clamp(1 - (tt - 1.5) / 1.3) * .8; g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + Math.cos(a) * (iw * .3 + r), cy + Math.sin(a) * (ih * .25 + r * .5), 2.2 * u, 0, 7); g.fill(); } g.restore(); }
    }
    raf = requestAnimationFrame(frame);
    addEventListener('resize', size);
  };
})();
