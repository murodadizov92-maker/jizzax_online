/* MeatCity — kirish (intro) animatsiyasi: haqiqiy logotip, kolbasa rangidagi yorqin fon, uchib aylanuvchi kolbasa bo'laklari */
(function () {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const easeOut = t => 1 - Math.pow(1 - t, 3), easeIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const spring = t => 1 + 2.9 * Math.pow(t - 1, 3) + 1.9 * Math.pow(t - 1, 2);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const LOW = window.LOW_END || (navigator.hardwareConcurrency || 8) <= 4;

  function sliceTex() {                                    // kolbasa kesimi: tashqi qobiq + pushti go'sht + oq yog' donalari
    const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'), R = 78;
    g.translate(80, 80);
    let gr = g.createRadialGradient(-20, -24, 6, 0, 0, R); gr.addColorStop(0, '#f08a45'); gr.addColorStop(1, '#a8340f'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
    gr = g.createRadialGradient(-18, -22, 4, 0, 0, R - 8); gr.addColorStop(0, '#ffb3ae'); gr.addColorStop(.7, '#e0706f'); gr.addColorStop(1, '#c14a4c'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R - 8, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, R - 8, 0, 7); g.clip();
    for (let i = 0; i < 70; i++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * (R - 10); g.fillStyle = `rgba(255,240,228,${rnd(.55, .95)})`; g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, rnd(1.5, 4.5), rnd(1.2, 3.2), rnd(0, 3), 0, 7); g.fill(); }
    for (let i = 0; i < 50; i++) { const a = rnd(0, 6.28), r = Math.sqrt(Math.random()) * (R - 10); g.fillStyle = `rgba(110,30,30,${rnd(.25, .5)})`; g.fillRect(Math.cos(a) * r, Math.sin(a) * r, rnd(1, 2.5), rnd(1, 2.5)); }
    g.restore(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R - 2, -2.6, -1.2); g.stroke();
    return c;
  }

  window.createIntro = function (canvas) {
    const g = canvas.getContext('2d'); let running = true, DPR = 1, W = 0, H = 0;
    const logo = new Image(), tex = sliceTex(); let logoOK = false; logo.onload = () => { logoOK = true; }; let tried = false; logo.onerror = () => { if (!tried) { tried = true; logo.src = '/static/logo.png'; } }; logo.src = '/static/logo.webp';
    const tmp = document.createElement('canvas'), tg = tmp.getContext('2d');
    const N = LOW ? 9 : 15, items = [];
    for (let i = 0; i < N; i++) items.push({ a0: (i / N) * 6.283 + rnd(-.2, .2), rr: rnd(.62, 1.12), sp: rnd(.25, .5) * (i % 2 ? 1 : -1), sz: rnd(.55, 1), ph: rnd(0, 6.28), spin: rnd(.8, 2.2), d: rnd(0, .5) });
    const bits = []; for (let i = 0; i < (LOW ? 30 : 60); i++) bits.push({ x: Math.random(), y: Math.random(), s: rnd(.4, 1.6), v: rnd(.03, .1), c: Math.random() < .5 ? '#ffd9a0' : '#ff9a55', ph: rnd(0, 6.28) });
    function resize() { DPR = Math.min(devicePixelRatio || 1, LOW ? 1.25 : 2); W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR); }
    resize(); addEventListener('resize', resize);
    const t0 = performance.now();

    function frame(now) {
      if (!running) return; requestAnimationFrame(frame);
      const t = (now - t0) / 1000, u = DPR, w = W * u, h = H * u, cx = w / 2, cy = h * .4;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      // fon: kolbasa ranglari — yorqin to'q sariq markaz, qizil chekka
      const bg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .85);
      bg.addColorStop(0, '#ffb067'); bg.addColorStop(.28, '#f0742a'); bg.addColorStop(.62, '#c23a17'); bg.addColorStop(1, '#5b0f0f');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      // aylanuvchi yorug' nurlar
      g.save(); g.translate(cx, cy); g.rotate(t * .18); g.fillStyle = 'rgba(255,232,190,.12)'; const R = Math.max(w, h);
      for (let k = 0; k < 12; k++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(R, -R * .09); g.lineTo(R, R * .09); g.closePath(); g.fill(); } g.restore();
      // zarralar (ziravor/uchqun)
      for (const b of bits) { const y = ((b.y - t * b.v) % 1 + 1) % 1, x = b.x + Math.sin(t * .8 + b.ph) * .02; g.globalAlpha = (.25 + .5 * Math.abs(Math.sin(t * 2 + b.ph))) * clamp(t / .6); g.fillStyle = b.c; g.beginPath(); g.arc(x * w, y * h, b.s * 2.2 * u, 0, 7); g.fill(); } g.globalAlpha = 1;

      const lt = t - .75, pop = clamp(lt / 1.15), lw = Math.min(w * .74, 360 * u), lh = lw * (logo.naturalHeight / (logo.naturalWidth || 1) || .712);
      // zarba to'lqinlari
      for (let k = 0; k < 3; k++) { const q = clamp((t - 1.05 - k * .22) / 1.1); if (q > 0 && q < 1) { g.strokeStyle = `rgba(255,238,205,${(1 - q) * .55})`; g.lineWidth = (6 - 4 * q) * u; g.beginPath(); g.ellipse(cx, cy, lw * (.45 + q * 1.5), lh * (.45 + q * 1.5), 0, 0, 7); g.stroke(); } }
      const flash = Math.max(0, 1 - Math.abs(t - 1.1) / .35); if (flash > 0) { const fg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .7); fg.addColorStop(0, `rgba(255,248,230,${flash * .85})`); fg.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = fg; g.fillRect(0, 0, w, h); }

      // kolbasa bo'laklari: logo atrofida uchib aylanadi (orqadagilari logodan oldin, oldindagilari keyin)
      const burst = t > 1.05 ? Math.exp(-(t - 1.05) * 2.4) * .45 : 0;
      const ds = items.map(it => {
        const e = easeOut(clamp((t - .1 - it.d * .5) / 1.3)), a = it.a0 + it.sp * t + (1 - e) * 3.2, rr = it.rr * (1 + (1 - e) * 2.2 + burst);
        const x = cx + Math.cos(a) * w * .46 * rr, y = cy + Math.sin(a) * h * .21 * rr + Math.sin(t * 1.3 + it.ph) * 6 * u, z = Math.sin(a), s = (.7 + .4 * z) * it.sz * Math.min(w, h * .6) * .2;
        return { it, x, y, z, s, e, a };
      }).sort((p, q) => p.z - q.z);
      const drawDisc = d => {
        const sy = .32 + .68 * Math.abs(Math.cos(t * d.it.spin + d.it.ph)), r = d.s;
        g.save(); g.globalAlpha = clamp(d.e * 1.4); g.translate(d.x, d.y); g.rotate(Math.sin(t + d.it.ph) * .5 + d.a * .3); g.scale(1, sy);
        g.shadowColor = 'rgba(60,5,5,.45)'; g.shadowBlur = 14 * u; g.shadowOffsetY = 6 * u; g.drawImage(tex, -r, -r, r * 2, r * 2); g.restore();
      };
      for (const d of ds) if (d.z < 0) drawDisc(d);

      // logotip: ochilib chiqadi (aylanib), yorqin, nurlanadi, yaltiraydi
      if (lt > 0) {
        const sc = Math.max(.001, spring(pop)), flip = Math.cos((1 - easeOut(pop)) * Math.PI * 1.5), bob = Math.sin(t * 1.6) * 6 * u, pulse = .5 + .5 * Math.sin(t * 3.2);
        const gl = g.createRadialGradient(cx, cy + bob, 0, cx, cy + bob, lw * .95); gl.addColorStop(0, `rgba(255,214,150,${.55 * pop})`); gl.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gl; g.fillRect(0, 0, w, h);
        g.save(); g.globalAlpha = .35 * pop; g.fillStyle = '#3a0505'; g.beginPath(); g.ellipse(cx, cy + lh * .62 * sc, lw * .38 * sc, lh * .06, 0, 0, 7); g.fill(); g.restore();
        g.save(); g.translate(cx, cy + bob); g.rotate(Math.sin(t * 1.2) * .035); g.scale(sc * Math.max(.04, Math.abs(flip)), sc);
        g.shadowColor = `rgba(255,170,90,${.55 + .3 * pulse})`; g.shadowBlur = (28 + 18 * pulse) * u;
        if (logoOK) {
          const sh = clamp((t - 2.05) / .8); let src = logo;
          if (sh > 0 && sh < 1) { tmp.width = logo.naturalWidth; tmp.height = logo.naturalHeight; tg.drawImage(logo, 0, 0); tg.globalCompositeOperation = 'source-atop'; const bx = -tmp.width * .3 + sh * tmp.width * 1.6, gr = tg.createLinearGradient(bx - tmp.width * .14, 0, bx + tmp.width * .14, tmp.height * .3); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); tg.fillStyle = gr; tg.fillRect(0, 0, tmp.width, tmp.height); src = tmp; }
          g.drawImage(src, -lw / 2, -lh / 2, lw, lh);
        } else { g.fillStyle = '#c4121f'; g.beginPath(); g.ellipse(0, 0, lw / 2, lh / 2, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `italic 700 ${lh * .55}px Georgia,serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('mc', 0, lh * .04); }
        g.restore();
      }
      for (const d of ds) if (d.z >= 0) drawDisc(d);
      // chetlarni qoraytirish (kino ko'rinishi)
      const vg = g.createRadialGradient(cx, h * .5, Math.min(w, h) * .45, cx, h * .5, Math.max(w, h) * .8); vg.addColorStop(0, 'rgba(40,0,0,0)'); vg.addColorStop(1, 'rgba(40,0,0,.45)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
    }
    requestAnimationFrame(frame);
    return { stop() { running = false; removeEventListener('resize', resize); } };
  };
})();
