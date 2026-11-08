/* MeatCity — mahsulot reklama roligi (ovozsiz, avtomatik yasaladi):
   rasm foni olinadi, mahsulot mos fonda har tomondan aylanib ko'rsatiladi, yaqinlashadi, yaltiraydi; nom va narx chiqadi.  Shu video (1) tepadagi bannerda aylanib turadi, (2) bosilganda to'liq ekranda ochiladi. */
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
  /* ------------------------------------------------------------ rasm tayyorlash */
  function loadImg(url) {
    return new Promise(res => {
      const a = new Image(); a.crossOrigin = 'anonymous';
      a.onload = () => res({ im: a, cors: true });
      a.onerror = () => { const b = new Image(); b.onload = () => res({ im: b, cors: false }); b.onerror = () => res(null); b.src = url; };
      a.src = url;
    });
  }

  // fonni olib tashlaydi: chetdagi rangdan boshlab to'ldirish; faqat eng katta bo'lak(lar) qoladi
  function roundedPhoto(im, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.beginPath(); if (g.roundRect) g.roundRect(0, 0, w, h, Math.min(w, h) * .08); else g.rect(0, 0, w, h); g.clip(); g.drawImage(im, 0, 0, w, h); return c;
  }
  function avgColor(c) { try { const s = document.createElement('canvas'); s.width = s.height = 6; const g = s.getContext('2d'); g.drawImage(c, 0, 0, 6, 6); const d = g.getImageData(0, 0, 6, 6).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } return n ? [r / n | 0, gg / n | 0, b / n | 0] : [150, 60, 40]; } catch (e) { return [150, 60, 40]; } }
  function cutout(im, cors) {
    const MAX = LOW ? 460 : 640, sc = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(2, Math.round(im.naturalWidth * sc)), h = Math.max(2, Math.round(im.naturalHeight * sc));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h);
    const photo = () => { const rc = roundedPhoto(im, w, h); return { canvas: rc, w, h, mode: 'photo', color: avgColor(rc) }; };
    if (!cors) return photo();
    let d; try { d = g.getImageData(0, 0, w, h); } catch (e) { return photo(); }
    const px = d.data, N = w * h;
    // chet piksellaridan fon rangini aniqlaymiz (mediana)
    const rs = [], gs = [], bs = [];
    const take = i => { rs.push(px[i * 4]); gs.push(px[i * 4 + 1]); bs.push(px[i * 4 + 2]); };
    for (let x = 0; x < w; x += 2) { take(x); take((h - 1) * w + x); } for (let y = 0; y < h; y += 2) { take(y * w); take(y * w + w - 1); }
    const med = a => a.sort((p, q) => p - q)[a.length >> 1], bR = med(rs), bG = med(gs), bB = med(bs);
    const isBg = i => {
      const R = px[i * 4], G = px[i * 4 + 1], B = px[i * 4 + 2];
      if (px[i * 4 + 3] < 12) return true;
      if (Math.max(Math.abs(R - bR), Math.abs(G - bG), Math.abs(B - bB)) < 44) return true;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      return (mx - mn) < 24 && mx > 120;                                      // och kulrang/oq fon, soyalar
    };
    const bg = new Uint8Array(N), st = [];
    const push = i => { if (!bg[i] && isBg(i)) { bg[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); } for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w); }
    let nb = 0; for (let i = 0; i < N; i++) nb += bg[i];
    if (nb / N < .08 || nb / N > .93) return photo();
    // mahsulot ichidagi oq yorliq chetga tegib fonga qo'shilib ketgan bo'lsa — ustun/qator bo'ylab to'ldiramiz
    const gapX = Math.round(w * .16), gapY = Math.round(h * .16), fillM = new Uint8Array(N);
    for (let x = 0; x < w; x++) { let last = -1; for (let y = 0; y < h; y++) { if (!bg[y * w + x]) { if (last >= 0 && y - last > 1 && y - last <= gapY) for (let k = last + 1; k < y; k++) fillM[k * w + x] = 1; last = y; } } }
    for (let y = 0; y < h; y++) { let last = -1; for (let x = 0; x < w; x++) { if (!bg[y * w + x]) { if (last >= 0 && x - last > 1 && x - last <= gapX) for (let k = last + 1; k < x; k++) fillM[y * w + k] = 1; last = x; } } }
    for (let i = 0; i < N; i++) if (fillM[i]) bg[i] = 0;
    // eng katta bo'laklarni qoldiramiz
    const comp = new Int32Array(N), sizes = [0]; let nc = 0;
    for (let s = 0; s < N; s++) {
      if (bg[s] || comp[s]) continue; nc++; let sz = 0; st.push(s); comp[s] = nc;
      while (st.length) { const i = st.pop(); sz++; const x = i % w, y = (i / w) | 0; const nbs = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]; for (const j of nbs) if (j >= 0 && !bg[j] && !comp[j]) { comp[j] = nc; st.push(j); } }
      sizes.push(sz);
    }
    const big = Math.max(...sizes); for (let i = 0; i < N; i++) if (!bg[i] && sizes[comp[i]] < big * .12) bg[i] = 1;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, r = 0, gg = 0, b = 0, cnt = 0, fg = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (bg[i]) { px[i * 4 + 3] = 0; continue; } fg++;
      const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
      if (edge) px[i * 4 + 3] = 120;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const R = px[i * 4], G = px[i * 4 + 1], B = px[i * 4 + 2]; if (Math.max(R, G, B) - Math.min(R, G, B) > 40) { r += R; gg += G; b += B; cnt++; }
    }
    if (fg / N < .03 || x1 <= x0 || y1 <= y0) return photo();
    g.putImageData(d, 0, 0);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch;
    const c2g = c2.getContext('2d'); c2g.drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
    try { const m = document.createElement('canvas'); m.width = cw; m.height = ch; const mg = m.getContext('2d'); mg.filter = 'blur(1.4px)'; mg.drawImage(c2, 0, 0); c2g.globalCompositeOperation = 'destination-in'; c2g.drawImage(m, 0, 0); c2g.globalCompositeOperation = 'source-over'; } catch (e) { }
    return { canvas: c2, w: cw, h: ch, mode: 'cut', color: cnt ? [r / cnt | 0, gg / cnt | 0, b / cnt | 0] : avgColor(c2) };
  }
  // orqa tomoni (aylanganda ko'rinadi) va qalinlik rangi
  function shade(src, mirror, a) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d');
    if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); } g.drawImage(src, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(0, 0, c.width, c.height); return c;
  }
  const cache = new Map();
  function prepare(p) {
    if (!p.image) return Promise.resolve(null);
    if (cache.has(p.image)) return cache.get(p.image);
    const pr = loadImg(p.image).then(l => {
      if (!l) return null;
      const ci = cutout(l.im, l.cors), color = ci.color, tmp = document.createElement('canvas'); tmp.width = ci.w; tmp.height = ci.h;
      return { ...ci, back: shade(ci.canvas, true, .3), edge: shade(ci.canvas, false, .5), tmp, bgc: mix(color, [6, 14, 12], .82), glow: mix(color, [255, 255, 255], .25) };
    }).catch(() => null);
    cache.set(p.image, pr); return pr;
  }

  /* ------------------------------------------------------------ video sahnasi: mahsulot har tomondan ko'rsatiladi */
  const LOOP = 8.2;
  function wrap(g, text, maxW, maxLines) {
    const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); } return lines;
  }
  function drawScene(g, W, H, u, tt, pr, p, compact, res) {
    res = res || 0;
    const price = Math.round(p.price).toLocaleString('ru-RU').replace(/,/g, ' ') + " so'm";
    const nm = p.name.replace(/\s+/g, ' ').trim();
    const na = easeOut(clamp((tt - .5) / .5)), pa = clamp((tt - 1.0) / .55), pe = spring(pa);
    // matn o'lchamlari (joylashuv uchun)
    const fs = compact ? 12 * u : 22 * u; g.font = `800 ${fs}px system-ui,sans-serif`;
    const lines = wrap(g, nm, compact ? W * .44 : W * .88, compact ? 2 : 3);
    const pillH = compact ? 24 * u : 52 * u, pillW = compact ? 112 * u : 210 * u;
    let cx, cy, maxW, maxH, textTop;
    if (compact) { cx = W * .75; cy = H * .5; maxW = W * .42; maxH = H * .84; textTop = 0; }
    else { const priceCy = H - res - 14 * u - pillH / 2; textTop = priceCy - pillH / 2 - 10 * u - lines.length * fs * 1.2; const top = 112 * u; cx = W / 2; cy = (top + textTop) / 2 + 6 * u; maxW = W * .8; maxH = (textTop - top) * .86; }
    const s0 = Math.min(maxW / pr.w, maxH / pr.h), pw = pr.w * s0, ph = pr.h * s0;

    // fon (mahsulot rangiga mos), harakatlanuvchi yorug'lik
    const bgG = g.createLinearGradient(0, 0, 0, H); bgG.addColorStop(0, rgb(mix(pr.bgc, pr.glow, .12))); bgG.addColorStop(1, rgb(mix(pr.bgc, [0, 0, 0], .55)));
    g.fillStyle = bgG; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 2; k++) { const bx = W * (.5 + Math.sin(tt * .6 + k * 3) * .35), by = H * (.35 + Math.cos(tt * .5 + k * 2) * .18), br = Math.max(W, H) * .6; const rg = g.createRadialGradient(bx, by, 0, bx, by, br); rg.addColorStop(0, rgb(pr.glow, .13)); rg.addColorStop(1, rgb(pr.glow, 0)); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    // markaziy nur + aylanuvchi nurlar
    const sp = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(pw, ph) * .95); sp.addColorStop(0, rgb(pr.glow, .38)); sp.addColorStop(1, rgb(pr.glow, 0)); g.fillStyle = sp; g.fillRect(0, 0, W, H);
    if (!LOW) { g.save(); g.translate(cx, cy); g.rotate(tt * .25); g.globalAlpha = .07 * easeOut(clamp(tt / 1)); g.fillStyle = rgb(pr.glow); const R = Math.max(W, H); for (let k = 0; k < 10; k++) { g.rotate(Math.PI / 5); g.beginPath(); g.moveTo(0, 0); g.lineTo(R, -R * .07); g.lineTo(R, R * .07); g.closePath(); g.fill(); } g.restore(); }
    // uchib yuruvchi zarralar
    g.save(); for (let k = 0; k < (LOW ? 8 : 18); k++) { const sd = k * 97.13, x = (Math.sin(sd) * .5 + .5) * W, ph0 = ((tt * (.05 + (k % 5) * .02) + (Math.sin(sd * 2) * .5 + .5)) % 1), y = H * (1.05 - ph0 * 1.15), a = Math.sin(ph0 * Math.PI) * .5; g.globalAlpha = a; g.fillStyle = '#fff'; g.beginPath(); g.arc(x + Math.sin(tt + k) * 8 * u, y, (1 + (k % 3)) * u, 0, 7); g.fill(); } g.restore();

    // mahsulot vaqt jadvali
    const enter = clamp(tt / 1.0), es = enter < 1 ? spring(enter) : 1, alpha = easeOut(clamp(tt / .4));
    const spinT = clamp((tt - 1.0) / 3.4), th = Math.PI * 2 * easeIO(spinT) + (tt < 1 ? -(1 - easeOut(enter)) * 1.6 : 0);
    const zk = clamp((tt - 4.5) / .9), zb = clamp((tt - 5.7) / .8), zoom = 1 + .32 * easeIO(zk) * (1 - easeIO(zb));
    const bob = Math.sin(tt * 1.7) * ph * .012, tilt = Math.sin(tt * 1.1) * .03;
    const c = Math.cos(th), sn = Math.sin(th), ac = Math.max(.035, Math.abs(c));
    const dropY = tt < 1 ? -(1 - bounce(enter)) * H * .22 : 0;
    const sc = Math.max(.01, es) * zoom;

    // soya
    g.save(); g.globalAlpha = alpha * .4; g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx, cy + ph * .5 * sc + 10 * u, pw * (.2 + .3 * ac) * sc, ph * .035 + 3 * u, 0, 0, 7); g.fill(); g.restore();

    // mahsulot (aylanadi: kenglik cos(th), orqa tomoni ko'rinadi)
    g.save(); if (!compact) { g.beginPath(); g.rect(0, 96 * u, W, Math.max(10, textTop - 6 * u - 96 * u)); g.clip(); }
    g.globalAlpha = alpha; g.translate(cx, cy + bob + dropY - (zoom - 1) * ph * .08); g.rotate(tilt); g.scale(sc, sc);
    g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 16 * u; g.shadowOffsetY = 8 * u;
    const depth = pw * .09, N = (compact || LOW) ? 1 : 7;
    if (N > 1 && ac < .85) { for (let i = 0; i < N; i++) { const f = i / (N - 1) - .5; g.save(); g.translate(sn * depth * f * -1, 0); g.scale(ac, 1); g.drawImage(pr.edge, -pw / 2, -ph / 2, pw, ph); g.restore(); } g.shadowColor = 'transparent'; }
    const shine = clamp((tt - 6.4) / 1.0), face = c >= 0 ? pr.canvas : pr.back;
    let src = face;
    if (c >= 0 && shine > 0 && shine < 1) { const t = pr.tmp.getContext('2d'); t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, pr.w, pr.h); t.drawImage(pr.canvas, 0, 0); t.globalCompositeOperation = 'source-atop'; const bx = -pr.w * .4 + shine * pr.w * 1.8, gr = t.createLinearGradient(bx - pr.w * .18, 0, bx + pr.w * .18, pr.h * .3); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); t.fillStyle = gr; t.fillRect(0, 0, pr.w, pr.h); src = pr.tmp; }
    g.save(); g.translate(sn * depth * .5 * (N > 1 ? 1 : 0), 0); g.scale(ac, 1); g.drawImage(src, -pw / 2, -ph / 2, pw, ph); g.restore();
    g.restore();

    // nom va narx (savatga tugmasidan tepada)
    g.save(); g.textBaseline = 'middle'; g.font = `800 ${fs}px system-ui,sans-serif`;
    if (compact) {
      g.globalAlpha = na; g.textAlign = 'left'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 6 * u;
      const ly = H - 10 * u - pillH - 8 * u - (lines.length - 1) * fs * 1.2; lines.forEach((ln, i) => g.fillText(ln, 10 * u, ly + i * fs * 1.2)); g.shadowBlur = 0; g.globalAlpha = 1;
      if (pa > 0) { g.translate(10 * u + pillW / 2, H - 10 * u - pillH / 2); g.scale(Math.max(.01, pe), Math.max(.01, pe)); g.shadowColor = 'rgba(239,43,61,.6)'; g.shadowBlur = 10 * u; g.fillStyle = '#ef2b3d'; rr(g, -pillW / 2, -pillH / 2, pillW, pillH, pillH / 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `800 ${13 * u}px system-ui,sans-serif`; g.fillText(price, 0, 1 * u); }
    } else {
      g.globalAlpha = na; g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 10 * u;
      lines.forEach((ln, i) => g.fillText(ln, W / 2, textTop + fs * .6 + i * fs * 1.2 + (1 - na) * 12 * u)); g.shadowBlur = 0; g.globalAlpha = 1;
      if (pa > 0) { const py = H - res - 14 * u - pillH / 2; g.translate(W / 2, py); g.scale(Math.max(.01, pe), Math.max(.01, pe)); g.shadowColor = 'rgba(239,43,61,.65)'; g.shadowBlur = 22 * u; g.fillStyle = '#ef2b3d'; rr(g, -pillW / 2, -pillH / 2, pillW, pillH, pillH / 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = `800 ${26 * u}px system-ui,sans-serif`; g.fillText(price, 0, 2 * u); }
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
      drawScene(g, cv.width, cv.height, DPR, tt, pr, p, false, ($('.ad-bar', root).offsetHeight || 90) * DPR);
      const fo = clamp((tt - (LOOP - .45)) / .45); if (fo > 0) { g.fillStyle = `rgba(0,0,0,${fo})`; g.fillRect(0, 0, cv.width, cv.height); }
    })(t0);
    addEventListener('resize', size);
  };
})();
