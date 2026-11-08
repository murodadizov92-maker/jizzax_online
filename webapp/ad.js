/* MeatCity — mahsulot videosi (ovozsiz, avtomatik yasaladi):
   rasmdagi mahsulot yog'och taxtaga tushadi, pichoq uni bo'lak-bo'lak kesadi, bo'laklar taxtaga taxlanadi,
   nom va narx chiqadi.  Shu video (1) tepadagi bannerda aylanib turadi, (2) bosilganda to'liq ekranda ochiladi. */
(function () {
  const LOW = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
  window.LOW_END = LOW;
  const $ = (s, r = document) => r.querySelector(s);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - Math.pow(1 - t, 3), easeIn = t => t * t, easeIO = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const spring = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const bounce = t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
  const mix = (c, k, t) => c.map((v, i) => Math.round(v * (1 - t) + k[i] * t));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const rr = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };

  /* ------------------------------------------------------------ rasm tayyorlash */
  function loadImg(url) {
    return new Promise(res => {
      const a = new Image(); a.crossOrigin = 'anonymous';
      a.onload = () => res({ im: a, cors: true });
      a.onerror = () => { const b = new Image(); b.onload = () => res({ im: b, cors: false }); b.onerror = () => res(null); b.src = url; };
      a.src = url;
    });
  }
  // oq fonni olib tashlaydi (chetdan to'ldirish) va mahsulotni kesib oladi
  function cutout(im, cors) {
    const MAX = LOW ? 420 : 560, sc = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(2, Math.round(im.naturalWidth * sc)), h = Math.max(2, Math.round(im.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h);
    const out = { canvas: c, w, h, mode: 'photo', color: [150, 60, 40] };
    if (!cors) return out;
    let d; try { d = g.getImageData(0, 0, w, h); } catch (e) { return out; }
    const px = d.data, bg = new Uint8Array(w * h), stack = [];
    const isW = i => (px[i * 4] > 240 && px[i * 4 + 1] > 240 && px[i * 4 + 2] > 240) || px[i * 4 + 3] < 12;
    const push = i => { if (!bg[i] && isW(i)) { bg[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) { const i = stack.pop(), x = i % w, y = (i / w) | 0; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); }
    let n = 0; for (let i = 0; i < bg.length; i++) n += bg[i];
    if (n / bg.length < .12) return out;
    let r = 0, gg = 0, b = 0, cnt = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (bg[i]) { px[i * 4 + 3] = 0; continue; }
      if ((x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w])) px[i * 4 + 3] = 150;
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
  // mahsulot o'qini gorizontal qilib burib qo'yadi (PCA) — kolbasa taxtada yotgandek tursin
  function align(ci) {
    if (ci.mode !== 'cut') return ci;
    const g = ci.canvas.getContext('2d'); let d; try { d = g.getImageData(0, 0, ci.w, ci.h).data; } catch (e) { return ci; }
    let n = 0, mx = 0, my = 0; const step = 3;
    for (let y = 0; y < ci.h; y += step) for (let x = 0; x < ci.w; x += step) if (d[(y * ci.w + x) * 4 + 3] > 128) { n++; mx += x; my += y; }
    if (n < 30) return ci; mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let y = 0; y < ci.h; y += step) for (let x = 0; x < ci.w; x += step) if (d[(y * ci.w + x) * 4 + 3] > 128) { const dx = x - mx, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = .5 * Math.atan2(2 * sxy, sxx - syy);
    const diag = Math.ceil(Math.hypot(ci.w, ci.h)), c = document.createElement('canvas'); c.width = c.height = diag;
    const cg = c.getContext('2d'); cg.translate(diag / 2, diag / 2); cg.rotate(-th); cg.drawImage(ci.canvas, -ci.w / 2, -ci.h / 2);
    const dd = cg.getImageData(0, 0, diag, diag).data; let x0 = diag, y0 = diag, x1 = 0, y1 = 0;
    for (let y = 0; y < diag; y++) for (let x = 0; x < diag; x++) if (dd[(y * diag + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return ci;
    const w = x1 - x0 + 1, h = y1 - y0 + 1, c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
    c2.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
    return { ...ci, canvas: c2, w, h };
  }
  // kesim yuzasi (ichi) — pushti go'sht + oq yog' bo'lakchalari; rangi mahsulotga qarab
  function meatDisc(color) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const meaty = color[0] > color[1] + 25 && color[0] > color[2] + 40;           // qizil/to'q sariq (kolbasa)
    const base = meaty ? [212, 120, 116] : mix(color, [255, 245, 220], .55);
    const gr = g.createRadialGradient(50, 46, 6, 64, 64, 62); gr.addColorStop(0, rgb(mix(base, [255, 255, 255], .18))); gr.addColorStop(1, rgb(mix(base, [0, 0, 0], .12)));
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(64, 64, 62, 0, 7); g.clip();
    for (let i = 0; i < 90; i++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * 62; g.fillStyle = meaty ? `rgba(252,238,226,${rnd(.5, .95)})` : `rgba(255,255,255,${rnd(.15, .4)})`; g.beginPath(); g.ellipse(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rnd(1.5, 4), rnd(1, 3), rnd(0, 3), 0, 7); g.fill(); }
    if (meaty) for (let i = 0; i < 70; i++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * 62; g.fillStyle = `rgba(90,30,28,${rnd(.25, .55)})`; g.fillRect(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rnd(1, 2), rnd(1, 2)); }
    g.restore(); return c;
  }
  const cache = new Map();
  function prepare(p) {
    if (!p.image) return Promise.resolve(null);
    if (cache.has(p.image)) return cache.get(p.image);
    const pr = loadImg(p.image).then(l => {
      if (!l) return null;
      let ci = align(cutout(l.im, l.cors));
      const elong = ci.w / ci.h, disc = ci.mode === 'cut' && elong >= 1.7;
      const color = ci.mode === 'cut' ? ci.color : (() => { try { const s = document.createElement('canvas'); s.width = s.height = 6; const g = s.getContext('2d'); g.drawImage(ci.canvas, 0, 0, 6, 6); const d = g.getImageData(0, 0, 6, 6).data; let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return [r / n | 0, gg / n | 0, b / n | 0]; } catch (e) { return ci.color; } })();
      return { ...ci, color, disc, meat: disc ? meatDisc(color) : null, rim: rgb(mix(color, [20, 8, 4], .45)), bgc: mix(color, [8, 16, 14], .8), glow: mix(color, [255, 255, 255], .2) };
    }).catch(() => null);
    cache.set(p.image, pr); return pr;
  }

  /* ------------------------------------------------------------ rasm chizish (video sahnasi) */
  const CUTS = 7, C0 = 1.3, CP = .8, LOOP = C0 + CUTS * CP + 2.5;
  const boards = new Map();
  function boardCanvas(W, H, compact, area) {
    const key = `${W}x${H}${compact ? 'c' : 'f'}`; if (boards.has(key)) return boards.get(key);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const { x, y, w, h } = area;
    const wood = g.createLinearGradient(0, y, 0, y + h); wood.addColorStop(0, '#b27a45'); wood.addColorStop(.5, '#9a6a3a'); wood.addColorStop(1, '#7a5028');
    g.save(); rr(g, x, y, w, h, compact ? 0 : 26); g.clip(); g.fillStyle = wood; g.fillRect(x, y, w, h);
    for (let i = 0; i < 46; i++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '55,30,12' : '215,165,105'},${rnd(.07, .2)})`; g.lineWidth = rnd(1, 3.2); g.beginPath(); const yy = y + Math.random() * h; g.moveTo(x, yy); g.bezierCurveTo(x + w * .3, yy + rnd(-8, 8), x + w * .65, yy + rnd(-8, 8), x + w, yy + rnd(-4, 4)); g.stroke(); }
    const sh = g.createLinearGradient(0, y, 0, y + h * .22); sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sh; g.fillRect(x, y, w, h * .22);
    g.restore();
    if (!compact) { g.strokeStyle = 'rgba(255,230,190,.25)'; g.lineWidth = 2; rr(g, x + 1, y + 1, w - 2, h - 2, 26); g.stroke(); }
    boards.set(key, c); if (boards.size > 6) boards.delete(boards.keys().next().value); return c;
  }

  function lay(W, H, u, pr, compact) {
    const asp = pr.w / pr.h, L = {};
    if (compact) {
      L.sh = Math.min(H * .40, (W * .52) / asp); L.sw = L.sh * asp; L.sx = W * .05; L.by = H * .86;
      L.D = L.sh * .92; L.pileX0 = W * .60; L.pileY = L.by - L.D * .5;
      L.step = Math.min(L.D * .36, (W * .965 - L.pileX0 - L.D) / (CUTS - 1));
      L.board = { x: 0, y: H * .62, w: W, h: H * .5 };
    } else {
      L.sw = Math.min(W * .88, H * .3 * asp); L.sh = L.sw / asp; L.sx = (W - L.sw) / 2; L.by = H * .30 + L.sh;
      L.D = Math.min(L.sh * .92, W * .26); L.step = Math.min(L.D * .38, (W * .86 - L.D) / (CUTS - 1));
      L.pileX0 = (W - (L.D + L.step * (CUTS - 1))) / 2; L.pileY = L.by + L.D * .72 + 18 * u;
      L.board = { x: W * .035, y: L.by - L.sh - 36 * u, w: W * .93, h: (L.pileY + L.D * .62 + 26 * u) - (L.by - L.sh - 36 * u) };
    }
    L.sliceW = (L.sw * .66) / CUTS; L.edge0 = L.sx + L.sw; L.midY = L.by - L.sh / 2;
    return L;
  }

  function drawKnife(g, x, tipY, len, u) {
    g.save(); g.translate(x, tipY); g.rotate(-.04);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 8 * u; g.shadowOffsetX = 3 * u;
    const bw = 8 * u, gr = g.createLinearGradient(-bw / 2, 0, bw / 2, 0); gr.addColorStop(0, '#7b868d'); gr.addColorStop(.35, '#f6fafc'); gr.addColorStop(.7, '#b6c0c6'); gr.addColorStop(1, '#6f7a81');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-bw / 2, -len); g.lineTo(bw / 2, -len); g.lineTo(bw / 2, -2 * u); g.lineTo(0, 0); g.lineTo(-bw / 2, -2 * u); g.closePath(); g.fill();
    g.shadowColor = 'transparent'; g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-bw * .12, -len, bw * .14, len - 3 * u);
    g.fillStyle = '#8f9aa1'; g.fillRect(-bw * .9, -len - 4 * u, bw * 1.8, 5 * u);                       // bolster
    const hg = g.createLinearGradient(-bw, 0, bw, 0); hg.addColorStop(0, '#0d0d10'); hg.addColorStop(.5, '#34343b'); hg.addColorStop(1, '#0d0d10');
    g.fillStyle = hg; rr(g, -bw * 1.15, -len - 42 * u, bw * 2.3, 40 * u, 6 * u); g.fill();
    g.fillStyle = '#c9ced2'; for (const k of [-34, -22, -10]) { g.beginPath(); g.arc(0, -len + k * u * .0 - 8 * u + k * u, 1.6 * u, 0, 7); g.fill(); }
    g.restore();
  }

  function drawScene(g, W, H, u, tt, pr, p, compact) {
    const L = lay(W, H, u, pr, compact);
    // fon: mahsulot rangiga mos
    const bgG = g.createLinearGradient(0, 0, 0, H); bgG.addColorStop(0, rgb(mix(pr.bgc, [20, 40, 34], .25))); bgG.addColorStop(1, rgb(mix(pr.bgc, [0, 0, 0], .6)));
    g.fillStyle = bgG; g.fillRect(0, 0, W, H);
    const gx = W * (.4 + Math.sin(tt * .8) * .12), rg = g.createRadialGradient(gx, H * .3, 0, gx, H * .3, W * .8); rg.addColorStop(0, rgb(pr.glow, .3)); rg.addColorStop(1, rgb(pr.glow, 0)); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.drawImage(boardCanvas(W, H, compact, L.board), 0, 0);

    // vaqt jadvali
    const drop = clamp(tt / .9), dy = -(1 - bounce(drop)) * H * .35 * (drop < 1 ? 1 : 0), alpha = easeOut(clamp(tt / .35));
    const spawn = k => C0 + k * CP + CP * .32;
    let m = 0; for (let k = 0; k < CUTS; k++) m += easeOut(clamp((tt - spawn(k)) / .1));
    const edge = L.edge0 - L.sliceW * m;

    // soyalar
    g.save(); g.globalAlpha = alpha * .5; g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse((L.sx + edge) / 2, L.by + 3 * u, Math.max(1, (edge - L.sx) / 2), L.sh * .09, 0, 0, 7); g.fill(); g.restore();

    // bo'laklar (taxtadagi uyum)
    for (let k = 0; k < CUTS; k++) {
      const t = (tt - spawn(k)) / .55; if (t < 0) continue;
      const e = easeOut(clamp(t)), fromX = L.edge0 - L.sliceW * (k + 1) + L.sliceW / 2, fromY = L.midY;
      const toX = L.pileX0 + L.D / 2 + k * L.step, toY = L.pileY;
      const x = fromX + (toX - fromX) * e, y = fromY + (toY - fromY) * e - Math.sin(Math.PI * clamp(t)) * L.sh * .9;
      const wob = ((k * 7919) % 11 - 5) * .018, rot = (1 - e) * -1.1 + wob;
      g.save(); g.globalAlpha = alpha;
      if (pr.disc) {
        const wd = L.sliceW + (L.D - L.sliceW) * easeIO(clamp(t * 1.15));
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(wd / L.D, 1);
        g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 7 * u; g.shadowOffsetY = 2.5 * u;
        g.fillStyle = pr.rim; g.beginPath(); g.arc(0, 0, L.D / 2, 0, 7); g.fill(); g.shadowColor = 'transparent';
        g.drawImage(pr.meat, -L.D * .46, -L.D * .46, L.D * .92, L.D * .92); g.restore();
        if (t < .3) { g.globalAlpha = alpha * (1 - t / .3); g.translate(x, y); g.rotate(rot); const sx0 = (L.edge0 - L.sliceW * (k + 1) - L.sx) / L.sw * pr.w; g.drawImage(pr.canvas, sx0, 0, pr.w * L.sliceW / L.sw, pr.h, -L.sliceW / 2, -L.sh / 2, L.sliceW, L.sh); }
      } else {                                                                    // oddiy rasm: bo'lak shaklida
        const sx0 = (L.edge0 - L.sliceW * (k + 1) - L.sx) / L.sw * pr.w, bw = L.sliceW * (1 + .6 * e);
        g.translate(x, y + (toY - y) * 0 + (1 - e) * 0); g.rotate(rot * .6 + wob);
        g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 7 * u; g.shadowOffsetY = 2.5 * u;
        g.drawImage(pr.canvas, sx0, 0, pr.w * L.sliceW / L.sw, pr.h, -bw / 2, -L.sh * .45, bw, L.sh * .9);
      }
      g.restore();
    }

    // mahsulot qoldig'i
    g.save(); g.globalAlpha = alpha; g.translate(0, dy);
    g.beginPath(); g.rect(L.sx - 4, L.by - L.sh - 6, edge - L.sx + 4, L.sh + 12); g.clip();
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 10 * u; g.shadowOffsetY = 4 * u;
    g.drawImage(pr.canvas, L.sx, L.by - L.sh, L.sw, L.sh);
    g.restore();
    if (m > .2 && pr.disc) {                                                       // kesilgan uchi (ichi ko'rinadi)
      g.save(); g.globalAlpha = alpha * clamp(m); g.translate(edge, L.midY); g.scale(.16, 1);
      g.fillStyle = pr.rim; g.beginPath(); g.arc(0, 0, L.sh * .46, 0, 7); g.fill(); g.drawImage(pr.meat, -L.sh * .42, -L.sh * .42, L.sh * .84, L.sh * .84); g.restore();
    }

    // pichoq
    const ci = Math.floor((tt - C0) / CP), ph = ((tt - C0) / CP) - ci, topY = L.by - L.sh - L.sh * .55, tip = L.by + 2 * u;
    let kx, ky;
    const cutX = k => L.edge0 - L.sliceW * (k + 1);
    if (tt < C0) { kx = cutX(0); ky = topY - 40 * u; if (tt > C0 - .5) ky = topY - 40 * u + (topY - (topY - 40 * u)) * 0; }
    else if (ci >= CUTS) { kx = cutX(CUTS - 1); ky = topY - 60 * u * easeOut(clamp((tt - (C0 + CUTS * CP)) / .5)) - 0; }
    else {
      kx = cutX(ci); const down = clamp(ph / .32), up = clamp((ph - .46) / .26);
      ky = ph < .32 ? topY + (tip - topY) * easeIn(down) : ph < .46 ? tip : tip + (topY - tip) * easeOut(up);
      if (ph > .62 && ci < CUTS - 1) kx = cutX(ci) + (cutX(ci + 1) - cutX(ci)) * easeIO(clamp((ph - .62) / .38));
    }
    if (tt < C0) { const a = clamp((tt - .8) / .5); ky = topY - 30 * u * (1 - easeOut(a)) - 0; g.save(); g.globalAlpha = a; drawKnife(g, kx, ky, L.sh * 1.15, u); g.restore(); }
    else drawKnife(g, kx, ky, L.sh * 1.15, u);

    // nom va narx
    const price = Math.round(p.price).toLocaleString('ru-RU').replace(/,/g, ' ') + " so'm";
    const nm = p.name.length > 40 ? p.name.slice(0, 38) + '…' : p.name;
    const na = easeOut(clamp((tt - .5) / .5)), pa = clamp((tt - 1.0) / .55), pe = spring(pa);
    g.save(); g.textBaseline = 'middle';
    if (compact) {
      const fs = 12 * u, pw = Math.min(W * .38, 118 * u), ph2 = 24 * u, px = W - 10 * u - pw, py = 8 * u;
      g.globalAlpha = na; g.textAlign = 'right'; g.fillStyle = '#fff'; g.font = `800 ${fs}px system-ui,sans-serif`; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 6 * u;
      let t = nm; while (g.measureText(t).width > W * .5 && t.length > 6) t = t.slice(0, -2); if (t !== nm) t += '…'; g.fillText(t, W - 10 * u, 50 * u);
      g.shadowBlur = 0; g.globalAlpha = 1;
      if (pa > 0) { g.translate(px + pw / 2, py + ph2 / 2); g.scale(Math.max(.01, pe), Math.max(.01, pe)); g.shadowColor = 'rgba(239,43,61,.6)'; g.shadowBlur = 10 * u; g.fillStyle = '#ef2b3d'; rr(g, -pw / 2, -ph2 / 2, pw, ph2, ph2 / 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `800 ${13 * u}px system-ui,sans-serif`; g.fillText(price, 0, 1 * u); }
    } else {
      const fs = 23 * u, ty = L.board.y + L.board.h + 34 * u; g.globalAlpha = na; g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = `800 ${fs}px system-ui,sans-serif`; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10 * u;
      const words = nm.split(' '), lines = []; let cur = ''; for (const w of words) { const tt2 = cur ? cur + ' ' + w : w; if (g.measureText(tt2).width > W * .86 && cur) { lines.push(cur); cur = w; } else cur = tt2; } if (cur) lines.push(cur);
      lines.slice(0, 3).forEach((ln, i) => g.fillText(ln, W / 2, ty + i * fs * 1.2)); g.shadowBlur = 0; g.globalAlpha = 1;
      if (pa > 0) { const pw = 220 * u, ph2 = 56 * u, py = ty + Math.min(3, lines.length) * fs * 1.2 + 14 * u; g.translate(W / 2, py + ph2 / 2); g.scale(Math.max(.01, pe), Math.max(.01, pe)); g.shadowColor = 'rgba(239,43,61,.65)'; g.shadowBlur = 24 * u; g.fillStyle = '#ef2b3d'; rr(g, -pw / 2, -ph2 / 2, pw, ph2, ph2 / 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = `800 ${27 * u}px system-ui,sans-serif`; g.fillText(price, 0, 2 * u); }
    }
    g.restore();
    // brend
    if (!compact) {
      g.save(); g.globalAlpha = clamp(tt / .6); const lr = 22 * u; g.fillStyle = '#c4121f'; g.beginPath(); g.arc(34 * u + lr / 2, 74 * u, lr, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `italic 700 ${26 * u}px Georgia,serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('mc', 34 * u + lr / 2, 76 * u);
      g.textAlign = 'left'; g.font = `800 ${17 * u}px system-ui,sans-serif`; g.fillText('MeatCity', 34 * u + lr * 1.9, 70 * u); g.font = `600 ${12 * u}px system-ui,sans-serif`; g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('Jizzax', 34 * u + lr * 1.9, 88 * u); g.restore();
    }
  }

  /* ------------------------------------------------------------ BANNER (tepada aylanib turadi) */
  window.createBanner = function (canvas, getList) {
    const g = canvas.getContext('2d'); let running = true, list = [], idx = -1, cur = null, curP = null, ts = performance.now(), loading = false, last = 0, dprv = 1;
    function resize() { dprv = Math.min(devicePixelRatio || 1, LOW ? 1 : 1.5); const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; canvas.width = Math.round(w * dprv); canvas.height = Math.round(h * dprv); }
    addEventListener('resize', resize); resize();
    async function next() {
      if (loading) return; loading = true;
      list = (getList() || []).filter(p => p.image); if (!list.length) { loading = false; return; }
      for (let tries = 0; tries < Math.min(6, list.length); tries++) {
        idx = (idx + 1 + (idx < 0 ? (Math.random() * list.length) | 0 : 0)) % list.length;
        const p = list[idx], pr = await prepare(p); if (!running) return;
        if (pr) { cur = pr; curP = p; ts = performance.now(); break; }
      }
      loading = false;
    }
    canvas.addEventListener('click', () => { if (curP && window.openAd) window.openAd(curP, window.__bannerAdd); });
    const FR = LOW ? 1000 / 20 : 1000 / 30;
    requestAnimationFrame(function loop(t) {
      if (!running) return; requestAnimationFrame(loop);
      if (document.hidden || window.__adOpen) return;
      if (t - last < FR) return; last = t;
      if (!cur) { g.fillStyle = '#0b2a1f'; g.fillRect(0, 0, canvas.width, canvas.height); if (!loading) next(); return; }
      const tt = (performance.now() - ts) / 1000;
      drawScene(g, canvas.width, canvas.height, dprv, tt, cur, curP, true);
      const fo = clamp((tt - (LOOP - .45)) / .45), fi = 1 - clamp(tt / .3);
      if (fo > 0 || fi > 0) { g.fillStyle = `rgba(8,23,15,${Math.max(fo, fi * .6)})`; g.fillRect(0, 0, canvas.width, canvas.height); }
      if (tt >= LOOP && !loading) next();
    });
    return { setProgress() {}, refresh() { if (!cur) next(); }, stop() { running = false; removeEventListener('resize', resize); } };
  };

  /* ------------------------------------------------------------ TO'LIQ EKRAN VIDEO */
  window.openAd = async function (p, onAdd) {
    if (!p || !p.image) return;
    const root = document.createElement('div'); root.id = 'ad';
    root.innerHTML = '<canvas></canvas><button class="ad-x" aria-label="Yopish">✕</button><div class="ad-bar"><button class="btn ad-add">🛒 Savatga qo\'shish</button></div>';
    document.body.appendChild(root); requestAnimationFrame(() => root.classList.add('on')); window.__adOpen = true;
    const cv = $('canvas', root), g = cv.getContext('2d'), DPR = Math.min(devicePixelRatio || 1, LOW ? 1.25 : 2);
    const size = () => { cv.width = innerWidth * DPR; cv.height = innerHeight * DPR; }; size();
    let alive = true, raf = 0;
    const close = () => { if (!alive) return; alive = false; window.__adOpen = false; cancelAnimationFrame(raf); removeEventListener('resize', size); root.classList.remove('on'); setTimeout(() => root.remove(), 350); if (window.__adBack) window.__adBack(); };
    $('.ad-x', root).onclick = close; $('.ad-add', root).onclick = () => { onAdd && onAdd(p); close(); }; window.__adClose = close;
    const pr = await prepare(p); if (!alive) return; if (!pr) { close(); return; }
    const t0 = performance.now();
    (function frame(now) {
      if (!alive) return; raf = requestAnimationFrame(frame);
      const tt = ((now - t0) / 1000) % LOOP;
      drawScene(g, cv.width, cv.height, DPR, tt, pr, p, false);
      const fo = clamp((tt - (LOOP - .45)) / .45); if (fo > 0) { g.fillStyle = `rgba(0,0,0,${fo})`; g.fillRect(0, 0, cv.width, cv.height); }
    })(t0);
    addEventListener('resize', size);
  };
})();
