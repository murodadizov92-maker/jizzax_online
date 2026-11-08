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

  // Rasm oq fonda olinadi: fonni "multiply" bilan och fonga qo'yamiz — oq joylar (lotok, fon) o'zi yo'qoladi,
  // qolgan qirralarni esa chetdan oqqa so'ndiramiz. Shuning uchun kesish xatosi bo'lmaydi.
  const cache = new Map();
  function prepare(p) {
    if (!p.image) return Promise.resolve(null);
    if (cache.has(p.image)) return cache.get(p.image);
    const pr = loadImg(p.image).then(l => {
      if (!l) return null;
      const MAX = LOW ? 460 : 640, im = l.im, sc = Math.min(1, MAX / Math.max(im.naturalWidth, im.naturalHeight));
      const w = Math.max(2, Math.round(im.naturalWidth * sc)), h = Math.max(2, Math.round(im.naturalHeight * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
      let color = [190, 90, 50];
      if (l.cors) { try {
        const d = g.getImageData(0, 0, w, h), px = d.data, rs = [], gs = [], bs = [];
        const take = i => { rs.push(px[i * 4]); gs.push(px[i * 4 + 1]); bs.push(px[i * 4 + 2]); };
        for (let x = 0; x < w; x += 2) { take(x); take((h - 1) * w + x); } for (let y = 0; y < h; y += 2) { take(y * w); take(y * w + w - 1); }
        const med = arr => arr.sort((p1, q) => p1 - q)[arr.length >> 1], k = [255 / Math.max(200, med(rs)), 255 / Math.max(200, med(gs)), 255 / Math.max(200, med(bs))];
        let r = 0, gg = 0, b = 0, n = 0;
        for (let i = 0; i < w * h; i++) {
          let R = Math.min(255, px[i * 4] * k[0]), G = Math.min(255, px[i * 4 + 1] * k[1]), B = Math.min(255, px[i * 4 + 2] * k[2]);
          if (R > 236 && G > 236 && B > 236) { R = G = B = 255; }                        // fon shovqinini oqqa tenglaymiz
          px[i * 4] = R; px[i * 4 + 1] = G; px[i * 4 + 2] = B; px[i * 4 + 3] = 255;
          if (Math.max(R, G, B) - Math.min(R, G, B) > 45 && (i & 3) === 0) { r += R; gg += G; b += B; n++; }
        }
        g.putImageData(d, 0, 0); if (n > 20) color = [r / n | 0, gg / n | 0, b / n | 0];
      } catch (e) { } }
      // chetlarni oqqa so'ndirish
      const f = Math.round(Math.min(w, h) * .07);
      for (const [x0, y0, x1, y1, w2, h2] of [[0, 0, f, 0, f, h], [w, 0, w - f, 0, f, h], [0, 0, 0, f, w, f], [0, h, 0, h - f, w, f]]) { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x0 === w ? w - f : x0, y0 === h ? h - f : y0, w2, h2); }
      const back = document.createElement('canvas'); back.width = w; back.height = h; const bg2 = back.getContext('2d');
      bg2.translate(w, 0); bg2.scale(-1, 1); bg2.drawImage(c, 0, 0); bg2.setTransform(1, 0, 0, 1, 0, 0);
      return { canvas: c, back, w, h, color, tint: mix(color, [255, 255, 255], .78), deep: mix(color, [255, 255, 255], .45) };
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
    const fs = compact ? 12 * u : 22 * u; g.font = `800 ${fs}px system-ui,sans-serif`;
    const lines = wrap(g, nm, compact ? W * .44 : W * .88, compact ? 2 : 3);
    const pillH = compact ? 24 * u : 52 * u, pillW = compact ? 112 * u : 210 * u;
    let cx, cy, maxW, maxH, textTop = 0;
    if (compact) { cx = W * .75; cy = H * .5; maxW = W * .42; maxH = H * .86; }
    else { const priceCy = H - res - 14 * u - pillH / 2; textTop = priceCy - pillH / 2 - 10 * u - lines.length * fs * 1.2; const top = 104 * u; cx = W / 2; cy = (top + textTop) / 2 + 4 * u; maxW = W * .86; maxH = (textTop - top) * .92; }
    const s0 = Math.min(maxW / pr.w, maxH / pr.h), pw = pr.w * s0, ph = pr.h * s0;
    const ink = '#2a1810';

    // och studiya foni: mahsulot rangidan juda yengil tus
    const bgG = g.createLinearGradient(0, 0, 0, H); bgG.addColorStop(0, rgb(mix(pr.tint, [255, 255, 255], .5))); bgG.addColorStop(.62, rgb(pr.tint)); bgG.addColorStop(1, rgb(mix(pr.deep, [255, 255, 255], .25)));
    g.fillStyle = bgG; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 2; k++) { const bx = W * (.5 + Math.sin(tt * .6 + k * 3) * .38), by = H * (.35 + Math.cos(tt * .5 + k * 2) * .2), br = Math.max(W, H) * .55; const rg = g.createRadialGradient(bx, by, 0, bx, by, br); rg.addColorStop(0, rgb(pr.deep, .35)); rg.addColorStop(1, rgb(pr.deep, 0)); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    if (!LOW) { g.save(); g.translate(cx, cy); g.rotate(tt * .22); g.globalAlpha = .1 * easeOut(clamp(tt / 1)); g.fillStyle = rgb(pr.color); const R = Math.max(W, H); for (let k = 0; k < 10; k++) { g.rotate(Math.PI / 5); g.beginPath(); g.moveTo(0, 0); g.lineTo(R, -R * .06); g.lineTo(R, R * .06); g.closePath(); g.fill(); } g.restore(); }
    // mahsulot orqasidagi oq nur (rasm oq fonda bo'lgani uchun u bilan qo'shilib ketadi)
    const sp = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(pw, ph) * .78); sp.addColorStop(0, 'rgba(255,255,255,1)'); sp.addColorStop(.55, 'rgba(255,255,255,.92)'); sp.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sp; g.fillRect(0, 0, W, H);
    g.save(); for (let k = 0; k < (LOW ? 8 : 16); k++) { const sd = k * 97.13, x = (Math.sin(sd) * .5 + .5) * W, ph0 = ((tt * (.05 + (k % 5) * .02) + (Math.sin(sd * 2) * .5 + .5)) % 1), y = H * (1.05 - ph0 * 1.15); g.globalAlpha = Math.sin(ph0 * Math.PI) * .55; g.fillStyle = rgb(pr.deep); g.beginPath(); g.arc(x + Math.sin(tt + k) * 8 * u, y, (1.5 + (k % 3)) * u, 0, 7); g.fill(); } g.restore();

    // vaqt jadvali
    const enter = clamp(tt / 1.0), es = enter < 1 ? spring(enter) : 1, alpha = easeOut(clamp(tt / .4));
    const spinT = clamp((tt - 1.0) / 3.4), th = Math.PI * 2 * easeIO(spinT) + (tt < 1 ? -(1 - easeOut(enter)) * 1.6 : 0);
    const zk = clamp((tt - 4.5) / .9), zb = clamp((tt - 5.7) / .8), zoom = 1 + .3 * easeIO(zk) * (1 - easeIO(zb));
    const bob = Math.sin(tt * 1.7) * ph * .012, tilt = Math.sin(tt * 1.1) * .025;
    const c = Math.cos(th), ac = Math.max(.035, Math.abs(c));
    const dropY = tt < 1 ? -(1 - bounce(enter)) * H * .22 : 0, sc = Math.max(.01, es) * zoom;

    // soya
    g.save(); g.globalAlpha = alpha * .22; g.fillStyle = rgb(mix(pr.color, [30, 10, 5], .6)); g.beginPath(); g.ellipse(cx, cy + ph * .5 * sc + 6 * u, pw * (.18 + .28 * ac) * sc, ph * .03 + 2.5 * u, 0, 0, 7); g.fill(); g.restore();

    // mahsulot (aylanadi; multiply: oq joylar fonga singib ketadi)
    g.save(); if (!compact) { g.beginPath(); g.rect(0, 90 * u, W, Math.max(10, textTop - 4 * u - 90 * u)); g.clip(); }
    g.globalAlpha = alpha; g.globalCompositeOperation = 'multiply';
    g.translate(cx, cy + bob + dropY - (zoom - 1) * ph * .06); g.rotate(tilt); g.scale(sc * ac, sc);
    g.drawImage(c >= 0 ? pr.canvas : pr.back, -pw / 2 / ac * ac, -ph / 2, pw, ph);
    g.restore();

    // nom va narx (savatga tugmasidan tepada)
    g.save(); g.textBaseline = 'middle'; g.font = `800 ${fs}px system-ui,sans-serif`;
    if (compact) {
      g.globalAlpha = na; g.textAlign = 'left'; g.fillStyle = ink;
      const ly = H - 10 * u - pillH - 8 * u - (lines.length - 1) * fs * 1.2; lines.forEach((ln, i) => g.fillText(ln, 10 * u, ly + i * fs * 1.2)); g.globalAlpha = 1;
      if (pa > 0) { g.translate(10 * u + pillW / 2, H - 10 * u - pillH / 2); g.scale(Math.max(.01, pe), Math.max(.01, pe)); g.shadowColor = 'rgba(239,43,61,.45)'; g.shadowBlur = 10 * u; g.fillStyle = '#ef2b3d'; rr(g, -pillW / 2, -pillH / 2, pillW, pillH, pillH / 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `800 ${13 * u}px system-ui,sans-serif`; g.fillText(price, 0, 1 * u); }
    } else {
      g.globalAlpha = na; g.textAlign = 'center'; g.fillStyle = ink;
      lines.forEach((ln, i) => g.fillText(ln, W / 2, textTop + fs * .6 + i * fs * 1.2 + (1 - na) * 12 * u)); g.globalAlpha = 1;
      if (pa > 0) { const py = H - res - 14 * u - pillH / 2; g.translate(W / 2, py); g.scale(Math.max(.01, pe), Math.max(.01, pe)); g.shadowColor = 'rgba(239,43,61,.5)'; g.shadowBlur = 20 * u; g.fillStyle = '#ef2b3d'; rr(g, -pillW / 2, -pillH / 2, pillW, pillH, pillH / 2); g.fill(); g.shadowBlur = 0; g.fillStyle = '#fff'; g.font = `800 ${26 * u}px system-ui,sans-serif`; g.fillText(price, 0, 2 * u); }
    }
    g.restore();
    if (!compact) {
      g.save(); g.globalAlpha = clamp(tt / .6); const lr = 22 * u; g.fillStyle = '#c4121f'; g.beginPath(); g.arc(34 * u + lr / 2, 74 * u, lr, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `italic 700 ${26 * u}px Georgia,serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('mc', 34 * u + lr / 2, 76 * u);
      g.textAlign = 'left'; g.font = `800 ${17 * u}px system-ui,sans-serif`; g.fillStyle = ink; g.fillText('MeatCity', 34 * u + lr * 1.9, 70 * u); g.font = `600 ${12 * u}px system-ui,sans-serif`; g.fillStyle = 'rgba(42,24,16,.6)'; g.fillText('Jizzax', 34 * u + lr * 1.9, 88 * u); g.restore();
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
      if (!cur) { g.fillStyle = '#f3e9e2'; g.fillRect(0, 0, canvas.width, canvas.height); if (!loading) next(); return; }
      const tt = (performance.now() - ts) / 1000;
      drawScene(g, canvas.width, canvas.height, dprv, tt, cur, curP, true);
      const fo = clamp((tt - (LOOP - .45)) / .45), fi = 1 - clamp(tt / .3);
      if (fo > 0 || fi > 0) { g.fillStyle = `rgba(255,250,245,${Math.max(fo, fi * .6)})`; g.fillRect(0, 0, canvas.width, canvas.height); }
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
      const fo = clamp((tt - (LOOP - .45)) / .45); if (fo > 0) { g.fillStyle = `rgba(255,250,245,${fo})`; g.fillRect(0, 0, cv.width, cv.height); }
    })(t0);
    addEventListener('resize', size);
  };
})();
