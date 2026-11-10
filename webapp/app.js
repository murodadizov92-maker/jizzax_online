/* MeatCity Jizzax — Online zakas Mini App (v2: animatsiyali) */
const tg = window.Telegram && Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('#efe3d7'); tg.setBackgroundColor('#e8dccf'); } catch (e) {} }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEV = new URLSearchParams(location.search).get('dev');
const ST = { new: ['🆕 Qabul qilindi', .08], collecting: ['📦 Yig\'ilmoqda', .35], on_way: ['🚚 Yo\'lda', .68], delivered: ['✅ Yetkazildi', 1] };
const buzz = (t = 'light') => { try { tg && tg.HapticFeedback.impactOccurred(t); } catch (e) {} };

async function api(path, opts = {}) {
  const headers = { 'X-Init-Data': tg ? tg.initData : '', ...(opts.headers || {}) };
  if (DEV) headers['X-Dev-User'] = DEV;
  if (opts.json) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const r = await fetch(path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Xato ' + r.status));
  return data;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2300); }

/* ================================================================== animatsiya yordamchilari */
function animateIn(root) {                       // elementlar birin-ketin pastdan chiqadi
  $$('[data-a]', root).forEach((el, i) => { el.classList.add('rise'); el.style.setProperty('--i', Math.min(i, 14)); });
}
function countTo(el, to, { dur = 1100, from = null } = {}) {   // raqam sanalib chiqadi
  const start = from ?? (parseFloat(el.dataset.v) || 0); el.dataset.v = to;
  if (REDUCE || start === to) { el.textContent = money(to); return; }
  const t0 = performance.now();
  (function f(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(2, -10 * p);
    el.textContent = money(start + (to - start) * (p >= 1 ? 1 : e));
    if (p < 1) requestAnimationFrame(f);
  })(t0);
}
function ripple(e, btn) {
  const r = btn.getBoundingClientRect(), d = Math.max(r.width, r.height), s = document.createElement('span');
  s.className = 'ripple'; s.style.cssText = `width:${d}px;height:${d}px;left:${(e.clientX || r.left + r.width / 2) - r.left - d / 2}px;top:${(e.clientY || r.top + r.height / 2) - r.top - d / 2}px`;
  btn.appendChild(s); setTimeout(() => s.remove(), 650);
}
document.addEventListener('pointerdown', e => { const b = e.target.closest('.btn,.add'); if (b) ripple(e, b); }, { passive: true });
const CAN_TILT = matchMedia('(hover: hover) and (pointer: fine)').matches;
function bindTilt(card) {                        // 3D qiyshayish (faqat kompyuterda)
  if (REDUCE || !CAN_TILT) return;
  card.addEventListener('pointermove', e => {
    const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    card.classList.add('tilt');
    card.style.setProperty('--ry', ((x - .5) * 16).toFixed(1) + 'deg'); card.style.setProperty('--rx', ((.5 - y) * 16).toFixed(1) + 'deg');
    card.style.setProperty('--gx', (x * 100) + '%'); card.style.setProperty('--gy', (y * 100) + '%'); card.style.setProperty('--go', 1);
  });
  ['pointerleave', 'pointerup', 'pointercancel'].forEach(ev => card.addEventListener(ev, () => {
    card.classList.remove('tilt'); ['--rx', '--ry'].forEach(k => card.style.setProperty(k, '0deg')); card.style.setProperty('--go', 0);
  }));
}
function confetti() {                            // zakas yuborilganda
  if (REDUCE) return;
  const c = $('#fx'), g = c.getContext('2d'); c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio; g.scale(devicePixelRatio, devicePixelRatio);
  const colors = ['#5eead4', '#10b981', '#ef2b3d', '#ffd166', '#c084fc', '#fff'];
  const ps = Array.from({ length: 130 }, () => ({ x: innerWidth / 2, y: innerHeight * .75, vx: (Math.random() - .5) * 15, vy: -Math.random() * 17 - 6, w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[(Math.random() * colors.length) | 0] }));
  let t0 = performance.now();
  (function f(t) {
    const dt = Math.min((t - t0) / 16, 2); t0 = t; g.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    ps.forEach(p => { p.vy += .5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.vx *= .99; if (p.y < innerHeight + 20) { alive++; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); } });
    if (alive) requestAnimationFrame(f); else g.clearRect(0, 0, innerWidth, innerHeight);
  })(t0);
}

/* ================================================================== 3D sahnalar (Three.js) */
function logoTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#c4121f'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff'; g.font = 'italic 700 150px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('mc', 128, 138);
  return new THREE.CanvasTexture(c);
}
function createScene(canvas, intro) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, window.LOW_END ? 1 : 1.5));
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xeadccd, 9, 28);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 80);
  scene.add(new THREE.AmbientLight(0xffffff, .8));
  const dl = new THREE.DirectionalLight(0xffffff, .9); dl.position.set(4, 8, 6); scene.add(dl);
  const rim = new THREE.PointLight(0xffb37a, 1.2, 20); rim.position.set(-3, 3, 4); scene.add(rim);
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const box = (w, h, d, c, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); parent.add(m); return m; };
  const logo = logoTexture();
  const tick = [];

  if (intro) {
    // logotip disk + aylanuvchi halqalar + zarrachalar
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, .28, 56), [M(0x7a0c15), new THREE.MeshBasicMaterial({ map: logo }), new THREE.MeshBasicMaterial({ map: logo })]);
    disc.rotation.x = Math.PI / 2; disc.scale.setScalar(.01); scene.add(disc);
    const rings = [];
    [1.7, 2.2, 2.7].forEach((r, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, .018, 8, 120), new THREE.MeshBasicMaterial({ color: [0xf2762e, 0xffb37a, 0xef2b3d][i], transparent: true, opacity: .0 }));
      m.rotation.x = 1.2 + i * .25; m.rotation.y = i * .6; m.position.y = 1.1; scene.add(m); rings.push(m);
    });
    const N = window.LOW_END ? 220 : 600, pos = new Float32Array(N * 3), seed = [];
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.283, r = 1.5 + Math.random() * 5, y = (Math.random() - .5) * 7 + 1; pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3); seed.push([a, r, y]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc89a, size: .06, transparent: true, opacity: .8 })); scene.add(pts);
    cam.position.set(0, 0, 10.5); cam.lookAt(0, .9, 0);
    let t0 = performance.now();
    tick.push(t => {
      const s = (t - t0) / 1000, k = Math.min(1, s / 1.1), e = 1 - Math.pow(1 - k, 4);
      disc.scale.setScalar(.01 + e * .99); disc.rotation.y = (1 - e) * 6 + s * .9; disc.position.y = 1.1 + Math.sin(s * 2) * .08;
      rings.forEach((r, i) => { r.material.opacity = Math.min(.55, Math.max(0, s - .3 - i * .2) * .6); r.rotation.z += .004 * (i + 1); r.scale.setScalar(.7 + Math.min(1, s / 1.6) * .3); });
      const p = geo.attributes.position.array;
      for (let i = 0; i < N; i++) { const [a, r, y] = seed[i], an = a + s * (.25 + 1 / r), rr = r * (1 - Math.min(.35, s * .09)); p[i * 3] = Math.cos(an) * rr; p[i * 3 + 1] = y + Math.sin(s + a) * .2; p[i * 3 + 2] = Math.sin(an) * rr; }
      geo.attributes.position.needsUpdate = true;
      cam.position.x = Math.sin(s * .4) * .8; cam.lookAt(0, .9, 0);   // kamera aylanadi, logo markazda qoladi
      rim.intensity = 1.2 + Math.sin(s * 3) * .5;
    });
  }

  // yo'l + mashina (banner va intro uchun)
  if (!intro) {
    box(60, .1, 30, 0xd9c5af, 0, -.06, -4);
    box(60, .06, 2.8, 0x6b625a, 0, 0, 0);
    for (let x = -14; x <= 14; x += 2) box(.9, .02, .12, 0xf5e6a8, x, .04, 0);
  }
  const truck = new THREE.Group(); scene.add(truck);
  box(2.5, 1.35, 1.25, 0xf4f4f8, -.3, .98, 0, truck);
  box(2.52, .22, 1.27, 0xc4121f, -.3, .5, 0, truck);
  box(1, .95, 1.2, 0xc4121f, 1.25, .72, 0, truck);
  box(.06, .42, .95, 0x9ad1ff, 1.78, .95, 0, truck);
  for (const z of [.63, -.63]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.95, .95), new THREE.MeshBasicMaterial({ map: logo }));
    p.position.set(-.3, 1.05, z); if (z < 0) p.rotation.y = Math.PI; truck.add(p);
  }
  const wheels = [];
  for (const [x, z] of [[-1, .62], [-1, -.62], [1.2, .62], [1.2, -.62]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .26, 18), M(0x111111));
    w.rotation.x = Math.PI / 2; w.position.set(x, .32, z); truck.add(w); wheels.push(w);
    w.add(new THREE.Mesh(new THREE.BoxGeometry(.5, .28, .09), M(0xdddddd)));
  }
  // faralar nuri
  const beam = new THREE.Mesh(new THREE.ConeGeometry(.9, 3, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: .13, side: THREE.DoubleSide }));
  beam.rotation.z = -Math.PI / 2; beam.position.set(3.3, .6, 0); truck.add(beam);

  if (intro) { truck.visible = false; }
  else {
    box(2.6, 1.8, 1.8, 0x9c8670, -6, .9, -2.4); box(2.8, .25, 2, 0xc4121f, -6, 1.9, -2.4);
    box(2.2, 1.4, 1.6, 0xa8927c, 6, .7, -2.4); box(2.4, .22, 1.8, 0xf2762e, 6, 1.5, -2.4);
    box(.06, 1.2, .06, 0xdddddd, 6.9, 2.1, -2.4); box(.5, .3, .04, 0xe11d2e, 7.15, 2.55, -2.4);
    for (let i = 0; i < 16; i++) { const x = -14 + i * 1.9 + Math.random(), h = 1 + Math.random() * 3; box(1.4, h, 1.2, [0xb9a58f, 0xc7b4a0, 0xa89480][i % 3], x, h / 2, -5.2 - Math.random() * 2); }
    cam.position.set(0, 2.5, 8.5); cam.lookAt(0, .9, 0);
  }

  let target = null, x = intro ? -9 : -4, last = performance.now(), running = true;
  function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  (function loop(t) {
    if (!running) return; requestAnimationFrame(loop);
    const dt = Math.min((t - last) / 1000, .05); last = t;
    if (intro) { x += dt * 3.2; if (x > 9) x = -9; truck.position.set(x, 0, 2.2); }
    else {
      if (target == null) { x += dt * 1.6; if (x > 6.5) x = -6.5; } else x += (target - x) * Math.min(1, dt * 1.8);
      truck.position.x = x;
    }
    const moving = intro || target == null || Math.abs(target - x) > .05;
    if (moving) wheels.forEach(w => w.rotation.y -= dt * 8 * (target == null || target > x ? 1 : -1));
    truck.position.y = moving ? Math.sin(t / 90) * .015 : 0;
    tick.forEach(f => f(t));
    renderer.render(scene, cam);
  })(performance.now());
  return {
    setProgress(p) { target = p == null ? null : -4.4 + p * 8.8; },
    stop() { running = false; removeEventListener('resize', resize); renderer.dispose(); }
  };
}

/* ================================================================== kirish (intro) */
let banner = null, introScene = null;
$('#introTitle').innerHTML = [...'MeatCity'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
try { introScene = window.createIntro ? createIntro($('#introCanvas')) : createScene($('#introCanvas'), true); } catch (e) { introScene = null; }
try { banner = window.createBanner ? createBanner($('#bannerCanvas'), () => S.products) : null; } catch (e) { banner = null; }
window.__bannerAdd = p => { S.cart[p.id] = (S.cart[p.id] || 0) + 1; saveCart(); toast('Savatga qo\'shildi'); };
async function playIntro() {
  await sleep(REDUCE ? 200 : 3600);
  const el = $('#intro');
  if (REDUCE) { el.remove(); document.body.classList.remove('booting'); return; }
  document.body.classList.remove('booting');                                  // ilova kontenti chiqa boshlaydi
  const a = el.animate([{ clipPath: 'circle(150% at 50% 62%)' }, { clipPath: 'circle(0% at 50% 62%)' }], { duration: 1050, easing: 'cubic-bezier(.75,0,.2,1)', fill: 'forwards' });
  a.onfinish = () => { el.remove(); introScene && introScene.stop(); };
}
playIntro();

/* ================================================================== holat */
const S = { notes: {}, me: null, products: [], cat: 'Hammasi', q: '', cart: JSON.parse(localStorage.getItem('cart') || '{}'), client: null, region: '', tab: 'all', timer: null, stats: { n: 0, sum: 0, way: 0 } };
const saveCart = () => { try { localStorage.setItem('cart', JSON.stringify(S.cart)); } catch (e) {} };
const view = $('#view');
const stepOf = p => p && p.unit === 'kg' ? .5 : 1;
const fq = v => (+v).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const stockInfo = p => {                                   // {cls, text} yoki null (qoldiq noma'lum bo'lsa)
  if (p.stock == null) return null; const u = p.stock_unit || (p.unit === 'kg' ? 'kg' : 'dona');
  if (p.stock <= 0) return { cls: 'out', text: '❌ Skladda yo\'q' };
  return { cls: p.stock <= (p.unit === 'kg' ? 10 : 5) ? 'low' : 'ok', text: `📦 Skladda: ${fq(p.stock)} ${u}` };
};
const shortOf = (p, q) => p && p.stock != null && q > p.stock ? Math.max(0, +(q - p.stock).toFixed(3)) : 0;
function render(html) { document.body.classList.remove('pick'); view.innerHTML = html; animateIn(view); scrollTo({ top: 0 }); setTimeout(() => dispatchEvent(new Event('resize')), 60); }
let backFn = null;
function setBack(fn) {
  backFn = fn; if (!tg) return;
  tg.BackButton.offClick(onBack); if (fn) { tg.BackButton.show(); tg.BackButton.onClick(onBack); } else tg.BackButton.hide();
}
function onBack() { backFn && backFn(); }
const cartSum = () => Object.entries(S.cart).reduce((s, [id, q]) => { const p = S.products.find(p => p.id === id); return s + (p ? p.price * q : 0); }, 0);
const cartCount = () => Object.keys(S.cart).length;
let lastCart = '';
function updateCartBar(show) {
  const bar = $('#cartbar'), n = cartCount();
  bar.classList.toggle('hidden', !(show && n));
  const label = `🛒 Savat: ${n} ta · ${money(cartSum())} so'm →`;
  if (label !== lastCart) { $('#cartBtn').textContent = label; lastCart = label; const b = $('#cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}
function clearTimer() { clearInterval(S.timer); S.timer = null; }

/* ---------- dock ---------- */
function setDock(name) {
  const dock = $('#dock'); dock.classList.toggle('hidden', !name);
  if (!name) return;
  $('#dockAdmin').classList.toggle('hidden', !(S.me && S.me.admin));
  const btns = $$('button', dock).filter(b => !b.classList.contains('hidden'));
  btns.forEach(b => b.classList.toggle('on', b.dataset.d === name));
  requestAnimationFrame(() => {
    const COLL = 57, GAP = 4, PAD = 6, mini = dock.classList.contains('mini');               // yig'ilgan tugma kengligi (ikonka + padding)
    let left = PAD;
    for (const b of btns) {
      const w = b.dataset.d === name ? COLL + 7 + $('span', b).scrollWidth : COLL;
      if (b.dataset.d === name) { const blob = $('#dockBlob'); blob.style.width = w + 'px'; blob.style.transform = `translateX(${mini ? 0 : left - PAD}px)`; }
      left += w + GAP;
    }
  });
}
const redock = () => { const on = $('#dock button.on'); on && setDock(on.dataset.d); };
$$('#dock button').forEach(b => b.onclick = () => { buzz(); const dk = $('#dock'); if (dk.classList.contains('mini')) { dk.classList.remove('mini'); redock(); return; } ({ home, new: newOrder, admin: adminView })[b.dataset.d](); });
// pastga aylantirilganda dock yig'iladi (faqat faol tugma qoladi), tepaga aylantirilsa yoki bosilsa ochiladi
let lastY = 0; addEventListener('scroll', () => { const y = scrollY, d = y - lastY; lastY = y; const dk = $('#dock'); if (dk.classList.contains('hidden')) return; const m = dk.classList.contains('mini'); if (!m && d > 8 && y > 90) { dk.classList.add('mini'); redock(); } else if (m && d < -8) { dk.classList.remove('mini'); redock(); } }, { passive: true });
addEventListener('resize', () => { const on = $('#dock button.on'); on && setDock(on.dataset.d); });

/* ================================================================== bosh sahifa */
function paintTabsPill() {
  const t = $('.tabs'); if (!t) return; const on = $('.tab.on', t), p = $('.pill', t);
  p.style.left = on.offsetLeft + 'px'; p.style.width = on.offsetWidth + 'px';
}
async function home() {
  clearTimer(); setBack(null); updateCartBar(false); setDock('home'); banner && banner.setProgress(null);
  render(`
    <div class="stats" data-a>
      <div class="stat"><b id="s1">0</b><small>Bugungi zakas</small></div>
      <div class="stat"><b id="s2">0</b><small>Bugungi summa</small></div>
      <div class="stat"><b id="s3">0</b><small>Yo'lda</small></div>
    </div>
    <button class="btn" id="newOrd" data-a>➕ Yangi zakas</button>
    <div class="tabs" data-a ${S.me.admin ? '' : 'style="display:none"'}><i class="pill"></i><div class="tab ${S.tab === 'all' ? 'on' : ''}" data-t="all">Hamma zakaslar</div><div class="tab ${S.tab === 'mine' ? 'on' : ''}" data-t="mine">Mening zakaslarim</div></div>
    <div id="list"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`);
  ['s1', 's2', 's3'].forEach((id, i) => { const el = $('#' + id); const v = [S.stats.n, S.stats.sum, S.stats.way][i]; el.dataset.v = 0; countTo(el, v, { dur: 900 }); });
  setTimeout(paintTabsPill, 30);
  $('#newOrd').onclick = newOrder;
  $$('.tab').forEach(t => t.onclick = () => { S.tab = t.dataset.t; $$('.tab').forEach(x => x.classList.toggle('on', x === t)); paintTabsPill(); buzz(); load(true); });
  let sig = '';
  async function load(animate) {
    try {
      const { items } = await api('/api/orders?scope=' + S.tab);
      const day0 = new Date(); day0.setHours(0, 0, 0, 0);
      const today = items.filter(o => o.created * 1000 >= day0.getTime());
      S.stats = { n: today.length, sum: today.reduce((s, o) => s + o.total, 0), way: items.filter(o => o.status === 'on_way').length };
      countTo($('#s1'), S.stats.n); countTo($('#s2'), S.stats.sum); countTo($('#s3'), S.stats.way);
      const nsig = JSON.stringify(items.map(o => [o.id, o.status, o.total]));
      if (nsig === sig && !animate) return; sig = nsig;
      $('#list').innerHTML = items.length ? items.map(o => `
        <div class="card click" data-id="${o.id}">
          <div class="row"><b>#${o.id} · ${esc(o.client_name)}</b><span class="badge s-${o.status}">${ST[o.status][0]}</span></div>
          <div class="mut">${esc(o.region || '')} · ${esc(o.user_name)} · ${new Date(o.created * 1000).toLocaleString('uz', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          <div class="row" style="margin-top:6px"><span class="mut">${o.items.length} ta mahsulot</span><b>${money(o.total)} so'm</b></div>
        </div>`).join('') : '<div class="mut" style="text-align:center;padding:30px">Hozircha zakas yo\'q</div>';
      $$('#list .card').forEach((c, i) => { c.classList.add('rise'); c.style.setProperty('--i', Math.min(i, 12)); c.onclick = () => detail(items.find(o => o.id == c.dataset.id)); });
    } catch (e) { $('#list').innerHTML = `<div class="mut">${esc(e.message)}</div>`; }
  }
  await load(true); S.timer = setInterval(() => load(false), 20000);
}

function detail(o) {
  clearTimer(); setBack(home); updateCartBar(false); setDock(null);
  banner && banner.setProgress(ST[o.status][1]);
  const keys = Object.keys(ST), idx = keys.indexOf(o.status);
  render(`
    <h2 data-a>Zakas #${o.id}</h2>
    <div class="card" data-a><b>${esc(o.client_name)}</b><div class="mut">${esc(o.region || '')}</div>
      <div class="track"><i id="trk"></i>${keys.map((k, n) => `<span class="${n <= idx ? 'on' : ''}"><b>${n < idx ? '✓' : n + 1}</b>${ST[k][0].replace(/^\S+\s/, '')}</span>`).join('')}</div></div>
    <div class="card" data-a>${o.items.map(i => `<div class="row" style="margin:6px 0"><span>${esc(i.name)} × ${fq(i.qty)} ${i.unit || ''}${i.short ? ' ⚠️' : ''}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
      <hr style="border:0;border-top:1px solid var(--line)"><div class="row"><span>Jami</span><span class="sum"><span id="tot">0</span> so'm</span></div></div>
    ${o.items.some(i => i.short) ? `<div class="card shortcard" data-a><b>⚠️ Skladda yetmagan</b><table class="stbl"><tr><th>Mahsulot</th><th>So'ralgan</th><th>Skladda</th><th>Yetmaydi</th></tr>${o.items.filter(i => i.short).map(i => `<tr><td>${esc(i.name)}</td><td>${fq(i.qty)}</td><td>${fq(i.stock || 0)}</td><td class="bad">${fq(i.short)}</td></tr>${i.note ? `<tr class="nt"><td colspan="4">✍️ ${esc(i.note)}</td></tr>` : ''}`).join('')}</table></div>` : ''}
    ${o.ddate ? `<div class="card" data-a>🚚 Yetkazish: <b>${o.ddate.split('-').reverse().join('.')}</b></div>` : ''}
    ${o.comment ? `<div class="card mut" data-a>💬 ${esc(o.comment)}</div>` : ''}
    ${S.me.admin ? `<div class="card" data-a><div class="mut" style="margin-bottom:8px">Holatni o'zgartirish (admin)</div>
      <div class="chips" style="flex-wrap:wrap">${keys.map(k => `<div class="chip ${k === o.status ? 'on' : ''}" data-s="${k}">${ST[k][0]}</div>`).join('')}</div>
      <button class="btn sec small" id="del" style="margin-top:8px">🗑 O'chirish</button></div>` : ''}`);
  countTo($('#tot'), o.total, { dur: 1000 });
  requestAnimationFrame(() => setTimeout(() => { $('#trk').style.width = `calc((100% - 24px) * ${idx / (keys.length - 1)})`; }, 250));
  $$('[data-s]').forEach(c => c.onclick = async () => {
    await api(`/api/orders/${o.id}/status`, { method: 'POST', json: { status: c.dataset.s } });
    o.status = c.dataset.s; toast('Holat yangilandi'); buzz('medium'); detail(o);
  });
  if ($('#del')) $('#del').onclick = async () => { if (confirm('Zakasni o\'chirasizmi?')) { await api('/api/orders/' + o.id, { method: 'DELETE' }); home(); } };
}

/* ================================================================== 1) mijoz */
async function newOrder() {
  clearTimer(); setBack(home); updateCartBar(false); setDock('new'); banner && banner.setProgress(null);
  S.region = S.me.admin ? (S.me.region || '') : (S.me.agent || ''); let agents = [];
  try { agents = (await api('/api/regions')).items; } catch (e) {}
  render(`
    <div class="steps" data-a><span class="on">1. Mijoz</span><span>2. Mahsulot</span><span>3. Tasdiq</span></div>
    <input id="q" placeholder="🔍 Mijoz nomini yozing…" autocomplete="off" data-a>
    <div class="chips" id="regs" data-a></div><div id="res"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`);
  const drawRegs = () => {
    if (!S.me.admin) $('#regs').style.display = 'none';
    $('#regs').innerHTML = `<div class="chip ${S.region ? '' : 'on'}" data-r="">Hammasi</div>` + agents.map(r => `<div class="chip ${S.region === r.region ? 'on' : ''}" data-r="${esc(r.region)}">🧑‍💼 ${esc(r.region)} <span style="opacity:.7">${r.count}</span></div>`).join('');
    $$('#regs .chip').forEach(c => c.onclick = () => {
      S.region = c.dataset.r; buzz(); drawRegs(); search();
      api('/api/me', { method: 'PUT', json: { region: S.region } }).then(() => S.me.region = S.region).catch(() => {});
    });
  };
  let tm, seq = 0;
  const hl = (name, q) => {                        // topilgan so'zni ajratib ko'rsatish (agar aynan shu yozuvda bo'lsa)
    const words = q.toLowerCase().split(/\s+/).filter(Boolean); let out = esc(name);
    words.forEach(w => { const i = name.toLowerCase().indexOf(w); if (i >= 0) { const real = esc(name.substr(i, w.length)); out = out.replace(real, `<mark>${real}</mark>`); } });
    return out;
  };
  const search = async () => {
    const my = ++seq, q = $('#q').value;
    try {
      const { items } = await api(`/api/clients?q=${encodeURIComponent(q)}&region=${encodeURIComponent(S.region)}`);
      if (my !== seq) return;
      $('#res').innerHTML = items.length ? items.map(c => `<div class="client rise" data-id="${c.id}"><b>${hl(c.name, q)}</b><div class="mut">${c.agent ? '🧑‍💼 ' + esc(c.agent) + ' · ' : ''}${esc(c.region)} ${esc(c.phone)}</div></div>`).join('') : '<div class="mut" style="margin-top:18px;text-align:center">Mijoz topilmadi</div>';
      $$('#res .client').forEach((el, i) => { el.style.setProperty('--i', Math.min(i, 10)); el.onclick = () => { buzz('medium'); S.client = items.find(c => c.id == el.dataset.id); pickProducts(); }; });
    } catch (e) { $('#res').innerHTML = `<div class="mut">${esc(e.message)}</div>`; }
  };
  $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(search, 120); };
  drawRegs(); search();
}

/* ================================================================== 2) mahsulotlar */
async function pickProducts() {
  setBack(newOrder); setDock(null);
  if (!S.products.length) {
    render('<div class="grid">' + '<div class="sk" style="height:220px;border-radius:22px"></div>'.repeat(4) + '</div>');
    try { S.products = (await api('/api/products')).items; } catch (e) { toast(e.message); return; }
  } else api('/api/products').then(r => { S.products = r.items; }).catch(() => {});
  const cats = ['Hammasi', ...new Set(S.products.map(p => p.category))];
  render(`
    <div class="steps" data-a><span>1. Mijoz</span><span class="on">2. Mahsulot</span><span>3. Tasdiq</span></div>
    <div class="card" style="margin-top:0" data-a><b>${esc(S.client.name)}</b> <span class="mut">${S.client.agent ? '🧑‍💼 ' + esc(S.client.agent) : esc(S.client.region)}</span></div>
    <input id="pq" placeholder="🔍 Mahsulot qidirish…" value="${esc(S.q)}" data-a>
    <div class="chips" id="cats" data-a>${cats.map(c => `<div class="chip ${c === S.cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</div>`).join('')}</div>
    <div class="grid" id="grid"></div><div id="sent" style="height:1px"></div>`);
  document.body.classList.add('pick'); setTimeout(() => dispatchEvent(new Event('resize')), 60);
  let shown = 0, list = [];
  const cardHtml = p => `
      <div class="prod ${S.cart[p.id] ? 'sel' : ''}" data-id="${p.id}">
        <div class="im ${p.image ? 'has' : ''}">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('ok')" onerror="this.remove()">` : '🥩'}<span class="tag">${esc(p.category)}</span>${p.image ? '<span class="play">▶ Reklama</span>' : ''}</div>
        <div class="in"><div class="nm">${esc(p.name)}</div><div class="pr">${money(p.price)} so'm / <span class="pr-u">${p.unit === 'kg' ? 'kg' : 'dona'}</span></div>
          ${(() => { const s = stockInfo(p); return s ? `<div class="stk ${s.cls}">${s.text}</div>` : ''; })()}
          <div class="qty"><button data-d="-1">−</button><input type="number" inputmode="decimal" min="0" step="any" value="${S.cart[p.id] || ''}" placeholder="0"><button data-d="1">+</button><i class="un">${p.unit === 'kg' ? 'kg' : 'dona'}</i></div>
          ${S.me && S.me.admin ? `<button class="unb">🔄 ${p.unit === 'kg' ? 'kg → dona' : 'dona → kg'}${p.unit_set ? '' : ' ?'}</button>` : ''}
          <div class="warn ${shortOf(p, S.cart[p.id]) ? 'on' : ''}">⚠️ Yetmaydi: ${fq(shortOf(p, S.cart[p.id]))} · zakas baribir yoziladi</div>
          <button class="add">Savatga</button></div>
      </div>`;
  const bindCard = (card, p) => {
    const id = card.dataset.id, inp = $('input', card);
    const warn = $('.warn', card);
    const set = v => { v = Math.max(0, +(+v || 0).toFixed(3)); if (v) S.cart[id] = v; else delete S.cart[id]; inp.value = v || ''; card.classList.toggle('sel', !!v); const sh = shortOf(p, v); warn.classList.toggle('on', !!sh); warn.textContent = `⚠️ Yetmaydi: ${fq(sh)} · zakas baribir yoziladi`; saveCart(); updateCartBar(true); buzz(); };
    $$('[data-d]', card).forEach(b => b.onclick = () => set((+inp.value || 0) + +b.dataset.d * stepOf(p)));
    const ub = $('.unb', card);
    const paintUnit = () => { const k = p.unit === 'kg'; if (ub) ub.textContent = `🔄 ${k ? 'kg → dona' : 'dona → kg'}${p.unit_set ? '' : ' ?'}`; $('.pr-u', card).textContent = k ? 'kg' : 'dona'; $('.qty .un', card).textContent = k ? 'kg' : 'dona'; };
    if (ub) ub.onclick = async e => {                      // kartochka qayta chizilmaydi (animatsiyasiz) — faqat yozuv almashadi
      e.stopPropagation(); const old = [p.unit, p.unit_set], nu = p.unit === 'kg' ? 'dona' : 'kg';
      p.unit = nu; p.unit_set = true; paintUnit(); buzz();
      try { await api(`/api/products/${p.id}/unit`, { method: 'PUT', json: { unit: nu } }); } catch (er) { [p.unit, p.unit_set] = old; paintUnit(); toast(er.message); }
    };
    inp.onchange = () => set(inp.value);
    $('.add', card).onclick = () => { if (!+inp.value) set(stepOf(p) === .5 ? 1 : 1); fly($('.im', card)); };
    if (p.image) $('.im', card).onclick = () => {
      buzz('medium'); const prev = backFn;
      setBack(() => window.__adClose && window.__adClose()); window.__adBack = () => setBack(prev);
      window.openAd(p, () => { if (!+inp.value) set(1); toast('Savatga qo\'shildi'); });
    };
    bindTilt(card);
  };
  const more = () => {                                   // 24 tadan chiqaradi — telefon qotmaydi
    const grid = $('#grid'), end = Math.min(list.length, shown + 24);
    for (let k = shown; k < end; k++) {
      const t = document.createElement('div'); t.innerHTML = cardHtml(list[k]); const card = t.firstElementChild;
      if (k < 10) { card.classList.add('rise'); card.style.setProperty('--i', k); }
      bindCard(card, list[k]); grid.appendChild(card);
    }
    shown = end;
  };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { if (es[0].isIntersecting && shown < list.length) more(); }, { rootMargin: '700px' }) : null;
  const draw = () => {
    const q = S.q.toLowerCase();
    list = S.products.filter(p => (S.cat === 'Hammasi' || p.category === S.cat) && (!q || p.name.toLowerCase().includes(q)));
    shown = 0; $('#grid').innerHTML = '';
    if (!list.length) { $('#grid').innerHTML = '<div class="mut" style="grid-column:1/-1;text-align:center;padding:24px">Hech narsa topilmadi</div>'; return; }
    more();
    if (io) { io.disconnect(); io.observe($('#sent')); } else while (shown < list.length) more();
  };
  $$('#cats .chip').forEach(c => c.onclick = () => { S.cat = c.dataset.c; buzz(); $$('#cats .chip').forEach(x => x.classList.toggle('on', x === c)); draw(); });
  let pqT; $('#pq').oninput = e => { S.q = e.target.value; clearTimeout(pqT); pqT = setTimeout(draw, 140); };
  $('#cartBtn').onclick = confirmView;
  draw(); updateCartBar(true);
}
function fly(src) {
  if (REDUCE) return;
  const a = src.getBoundingClientRect(), b = $('#cartBtn').getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'fly'; { const im = src.querySelector('img'); if (im) el.style.backgroundImage = `url('${im.currentSrc || im.src}')`; } document.body.appendChild(el);
  const sx = a.left + a.width / 2 - 28, sy = a.top + a.height / 2 - 28, ex = b.left + b.width / 2 - 28, ey = b.top + b.height / 2 - 28;
  el.animate([{ transform: `translate(${sx}px,${sy}px) scale(1.2) rotate(0)`, opacity: 1, left: 0, top: 0 },
    { transform: `translate(${(sx + ex) / 2}px,${Math.min(sy, ey) - 90}px) scale(.8) rotate(120deg)`, opacity: 1, left: 0, top: 0, offset: .45 },
    { transform: `translate(${ex}px,${ey}px) scale(.2) rotate(300deg)`, opacity: .2, left: 0, top: 0 }], { duration: 750, easing: 'cubic-bezier(.45,.05,.55,.95)' }).onfinish = () => el.remove();
}

/* ================================================================== 3) tasdiq */
function confirmView() {
  setBack(pickProducts); updateCartBar(false); setDock(null);
  const draw = () => {
    const rows = Object.entries(S.cart).map(([id, q]) => ({ p: S.products.find(p => p.id === id), id, q })).filter(r => r.p);
    render(`
      <div class="steps" data-a><span>1. Mijoz</span><span>2. Mahsulot</span><span class="on">3. Tasdiq</span></div>
      <div class="card" data-a><b>${esc(S.client.name)}</b><div class="mut">${S.client.agent ? '🧑‍💼 ' + esc(S.client.agent) : ''} ${esc(S.client.region)}</div></div>
      ${rows.map(r => { const s = stockInfo(r.p), sh = shortOf(r.p, r.q); return `<div class="card" data-a><div class="row"><b>${esc(r.p.name)}</b><button class="back" data-rm="${r.id}">✕</button></div>
        ${s ? `<div class="stk ${s.cls}">${s.text}</div>` : ''}
        <div class="row"><span class="mut">${money(r.p.price)} × </span><div class="qty" style="flex:1;max-width:240px;margin:0 8px"><button data-m="${r.id}">−</button><input type="number" step="any" inputmode="decimal" value="${r.q}" data-i="${r.id}"><button data-p="${r.id}">+</button><i class="un">${r.p.unit === 'kg' ? 'kg' : 'dona'}</i></div><b>${money(r.p.price * r.q)}</b></div></div>`; }).join('') || '<div class="mut" data-a>Savat bo\'sh</div>'}
      ${(() => { const sr = rows.filter(r => shortOf(r.p, r.q)); return sr.length ? `<div class="card shortcard" data-a><b>⚠️ Skladda yetmaydigan mahsulotlar</b>
        <div class="mut" style="margin:4px 0 8px">Zakas baribir yoziladi. Yetmasa nima qilish kerakligini izohda yozing (masalan: "boshqa turidan bering").</div>
        <table class="stbl"><tr><th>Mahsulot</th><th>So'ralgan</th><th>Skladda</th><th>Yetmaydi</th></tr>
        ${sr.map(r => `<tr><td>${esc(r.p.name)}</td><td>${fq(r.q)}</td><td>${fq(Math.max(0, r.p.stock))}</td><td class="bad">${fq(shortOf(r.p, r.q))}</td></tr><tr class="nt"><td colspan="4"><input data-n="${r.id}" placeholder="✍️ Izoh: yo'q bo'lsa nima qilamiz?" value="${esc(S.notes[r.id] || '')}"></td></tr>`).join('')}</table></div>` : ''; })()}
      <div class="card" data-a><b>🚚 Yetkazish kuni</b><div class="chips" id="dd" style="margin-top:8px">${[['Bugun',0],['Ertaga',1],['Indinga',2]].map(([t, n]) => `<div class="chip ${n === 1 ? 'on' : ''}" data-dn="${n}">${t}</div>`).join('')}</div>
        <input type="date" id="ddi" style="margin-top:8px"><div class="mut" id="ddt" style="margin-top:6px"></div></div>
      <textarea id="cm" rows="2" placeholder="💬 Izoh (ixtiyoriy)" data-a></textarea>
      <div class="row" style="margin:14px 0" data-a><span>Jami</span><span class="sum"><span id="tot">0</span> so'm</span></div>
      <button class="btn" id="send" data-a ${rows.length ? '' : 'disabled'}>✅ Zakasni yuborish</button>`);
    countTo($('#tot'), cartSum(), { dur: 700 });
    const chg = (id, v) => { v = Math.max(0, +(+v || 0).toFixed(3)); if (v) S.cart[id] = v; else delete S.cart[id]; saveCart(); buzz(); draw(); };
    initDD();
    $$('[data-n]').forEach(i => i.oninput = () => { S.notes[i.dataset.n] = i.value; });
    $$('[data-rm]').forEach(b => b.onclick = () => chg(b.dataset.rm, 0));
    $$('[data-m]').forEach(b => b.onclick = () => chg(b.dataset.m, S.cart[b.dataset.m] - stepOf(S.products.find(p => p.id === b.dataset.m))));
    $$('[data-p]').forEach(b => b.onclick = () => chg(b.dataset.p, S.cart[b.dataset.p] + stepOf(S.products.find(p => p.id === b.dataset.p))));
    $$('[data-i]').forEach(i => i.onchange = () => chg(i.dataset.i, i.value));
    $('#send').onclick = async () => {
      $('#send').disabled = true;
      try {
        const items = Object.entries(S.cart).map(([id, qty]) => ({ id, qty, note: S.notes[id] || '' }));
        const { order } = await api('/api/orders', { method: 'POST', json: { client_id: S.client.id, items, comment: $('#cm').value, ddate: window.__dd } });
        S.cart = {}; S.notes = {}; saveCart(); S.client = null; buzz('heavy'); confetti(); toast('Zakas yuborildi ✅');
        S.tab = 'mine'; detail(order); banner && banner.setProgress(ST.new[1]);
      } catch (e) { toast(e.message); $('#send').disabled = false; }
    };
  };
  draw();
}

/* ================================================================== admin */
async function loadUsers() {
  const box = $('#usr'); if (!box) return;
  try {
    const { items, agents } = await api('/api/users');
    box.innerHTML = items.map(u => `<div style="display:flex;gap:8px;align-items:center;margin:6px 0"><div style="flex:1;min-width:0"><b>${esc(u.name)}</b>${u.admin ? ' 👑' : ''}<div class="mut" style="font-size:12px">${u.username ? '@' + esc(u.username) + ' · ' : ''}${u.tg_id}</div></div>
      <select data-u="${u.tg_id}" style="max-width:48%"><option value="">🚫 Ruxsat yo'q</option>${agents.map(g => `<option ${u.agent === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>`).join('') || '<div class="mut">Hali hech kim kirmagan</div>';
    $('#nag').innerHTML = '<option value="">Agentni tanlang</option>' + agents.map(g => `<option>${esc(g)}</option>`).join('');
    $('#nadd').onclick = async () => { const id = $('#nid').value.replace(/\D/g, ''), ag = $('#nag').value; if (!id || !ag) return toast('ID va agentni kiriting'); try { await api('/api/users/' + id + '/access', { method: 'PUT', json: { agent: ag } }); toast('Qo\'shildi'); loadUsers(); } catch (e) { toast(e.message); } };
    box.querySelectorAll('select').forEach(s => s.onchange = async () => { try { await api('/api/users/' + s.dataset.u + '/access', { method: 'PUT', json: { agent: s.value } }); toast(s.value ? 'Ruxsat berildi' : 'Ruxsat olib tashlandi'); } catch (e) { toast(e.message); } });
  } catch (e) { box.textContent = e.message; }
}
function initDD() {
  const box = document.getElementById('dd'); if (!box) return;
  const iso = n => { const d = new Date(Date.now() + n * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
  const names = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
  const set = (v, chip) => { window.__dd = v; box.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === chip)); const i = document.getElementById('ddi'); i.value = v; const d = new Date(v + 'T12:00'); document.getElementById('ddt').textContent = '📅 ' + v.split('-').reverse().join('.') + ' · ' + names[d.getDay()]; };
  box.querySelectorAll('.chip').forEach(c => c.onclick = () => set(iso(+c.dataset.dn), c));
  document.getElementById('ddi').min = iso(0);
  document.getElementById('ddi').onchange = e => e.target.value && set(e.target.value, null);
  set(iso(1), box.querySelector('[data-dn="1"]'));
}
function adminView() {
  clearTimer(); setBack(home); updateCartBar(false); setDock('admin');
  render(`
    <h2 data-a>⚙️ Admin</h2>
    <div class="card" data-a><b>👥 Foydalanuvchilar</b><div class="mut">Agentni Telegram foydalanuvchisiga bog'lang. Bog'langan agent zakas bera oladi va faqat o'z mijozlarini ko'radi; guruhga agent nomi bilan boradi.</div><div id="usr" style="margin-top:8px">...</div>
      <div style="margin-top:10px;border-top:1px solid rgba(0,0,0,.08);padding-top:10px"><b style="font-size:14px">➕ ID bo'yicha qo'shish</b>
      <input id="nid" inputmode="numeric" placeholder="Telegram ID (masalan 7553654583)" style="margin-top:6px"><select id="nag" style="margin-top:6px;width:100%"></select>
      <button class="btn sec small" id="nadd" style="margin-top:8px">✅ Ruxsat berish</button></div></div>
    <div class="card" data-a><b>💾 Ma'lumotlar zaxirasi</b><div class="mut" id="bk" style="margin-top:6px">...</div></div>
    <div class="card" data-a><b>Mijozlar bazasi</b><div class="mut">Hozir: ${S.me.clients} ta. Sales Doctor Excel: ИД клиента, Название клиента, Агент, Территория</div>
      <input type="file" id="xl" accept=".xlsx" style="margin-top:8px"><button class="btn sec small" id="up" style="margin-top:8px">📥 Excel yuklash</button>
      <button class="btn small" id="clsd" style="margin-top:8px">🔄 Sales Doctor'dan yangilash</button><div class="mut" id="clsdt" style="margin-top:6px">Excel shart emas: ilova o'zi Sales Doctor'dan oladi va har 6 soatda yangilab turadi.</div></div>
    <div class="card" data-a><b>Mijoz qo'shish</b>
      <input id="n" placeholder="Nomi" style="margin-top:8px"><input id="ph" placeholder="Telefon" style="margin-top:6px"><input id="rg" placeholder="Hudud" style="margin-top:6px"><input id="ad" placeholder="Manzil" style="margin-top:6px">
      <button class="btn sec small" id="addc" style="margin-top:8px">➕ Qo'shish</button></div>
    <div class="card" data-a><b>📦 Sklad qoldig'i (ostatka)</b><div class="mut" id="stinfo">Yuklanmoqda…</div>
      <button class="btn sec small" id="stsd" style="margin-top:8px">🔄 Sales Doctor'dan olish</button>
      <div style="margin-top:8px"><input type="file" id="stx" accept=".xlsx"><button class="btn sec small" id="stup" style="margin-top:8px">📥 Excel'dan yuklash</button></div>
      <div class="mut" id="stdbg" style="margin-top:8px;white-space:pre-wrap;word-break:break-all;font-size:11px"></div></div>
    <div class="card" data-a><b>Mahsulotlarni yangilash</b><div class="mut">Narx/rasm zakas bot'dan avtomatik olinadi (har ~45 soniyada).</div><button class="btn sec small" id="sync" style="margin-top:8px">🔄 Hozir yangilash</button></div>`);
  loadUsers();
  { const b = $('#clsd'); if (b) b.onclick = async () => { b.disabled = true; $('#clsdt').textContent = '⏳ Olinmoqda...'; try { const r = await api('/api/clients/sync', { method: 'POST' }); $('#clsdt').innerHTML = r.ok ? `✅ Topildi ${r.total} · yangi ${r.added} · yangilandi ${r.updated}` + (r.skipped_other_agents ? ` · boshqa agent ${r.skipped_other_agents} (o'tkazib yuborildi)` : '') + (r.no_agent ? ` · agentsiz ${r.no_agent}` : '') + (r.sample ? `<br><small style="word-break:break-all">Namuna: ${esc(r.sample)}</small>` : '') : '❌ ' + r.error; } catch (e) { $('#clsdt').textContent = '❌ ' + e.message; } b.disabled = false; }; }
  api('/api/backup').then(b => { const e = $('#bk'); if (!e) return; e.innerHTML = !b.enabled ? '⚠️ DATABASE_URL yo\'q — zaxira ishlamayapti, deploydan keyin ma\'lumot yo\'qoladi' : b.ok === false ? '❌ Xato: ' + esc(b.error) : b.ok ? '✅ Saqlanmoqda (' + Math.round(b.size / 1024) + ' KB)' + (b.boot === 'restored' ? ' · oxirgi deployda tiklandi' : '') : '⏳ Birinchi nusxa kutilmoqda'; }).catch(() => {});
  $('#up').onclick = async () => {
    const f = $('#xl').files[0]; if (!f) return toast('Fayl tanlang');
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api('/api/clients/import', { method: 'POST', body: fd }); toast(`${r.rows} ta mijoz yuklandi`); S.me = await api('/api/me'); adminView(); } catch (e) { toast(e.message); }
  };
  $('#addc').onclick = async () => {
    try { await api('/api/clients', { method: 'POST', json: { name: $('#n').value, phone: $('#ph').value, region: $('#rg').value, address: $('#ad').value } }); toast('Qo\'shildi'); S.me = await api('/api/me'); adminView(); } catch (e) { toast(e.message); }
  };
  const stInfo = async () => {
    try { const s = await api('/api/stock/status');
      $('#stinfo').innerHTML = `Mahsulotlar: ${s.products} ta · qoldig'i topilgan: <b>${s.matched}</b> ta · sklad qatorlari: ${s.rows}<br>${s.t ? 'Oxirgi yangilanish: ' + new Date(s.t * 1000).toLocaleString('uz') + ' (' + esc(s.src) + ')' : 'Hali yuklanmagan'}${s.sd ? '' : '<br>⚠️ Sales Doctor ulanmagan (SD_LOGIN / SD_PASSWORD)'}${s.error ? '<br>⚠️ ' + esc(s.error) : ''}<br>Kg/dona belgilanmagan: ${s.unit_unset} ta (mahsulot kartochkasida belgilang)${s.unmatched.length ? '<br><span style="opacity:.8">Qoldig\'i topilmaganlar: ' + s.unmatched.slice(0, 6).map(esc).join('; ') + '…</span>' : ''}`;
    } catch (e) { $('#stinfo').textContent = e.message; }
  };
  stInfo();
  $('#stsd').onclick = async () => { $('#stdbg').textContent = '…'; try { const r = await api('/api/stock/sync?debug=1', { method: 'POST' }); $('#stdbg').textContent = r.ok ? `✅ ${r.rows} ta qator (${r.method})` : `❌ ${r.error}\n` + JSON.stringify(r.tried || [], null, 1).slice(0, 900); S.products = (await api('/api/products')).items; stInfo(); } catch (e) { $('#stdbg').textContent = e.message; } };
  $('#stup').onclick = async () => { const f = $('#stx').files[0]; if (!f) return toast('Fayl tanlang'); const fd = new FormData(); fd.append('file', f); try { const r = await api('/api/stock/import', { method: 'POST', body: fd }); toast(`${r.rows} ta qator yuklandi`); S.products = (await api('/api/products')).items; stInfo(); } catch (e) { toast(e.message); } };
  $('#sync').onclick = async () => { try { S.products = (await api('/api/products?force=1')).items; toast(`${S.products.length} ta mahsulot`); } catch (e) { toast(e.message); } };
}

/* ================================================================== katta yozuv (kattalar uchun) */
(function () {
  let big = '1'; try { big = localStorage.getItem('big') || '1'; } catch (e) {}
  const apply = () => { document.body.classList.toggle('big', big === '1'); const b = $('#aa'); if (b) b.textContent = big === '1' ? 'Aa −' : 'Aa +'; };
  const btn = document.createElement('button'); btn.id = 'aa'; btn.setAttribute('aria-label', 'Yozuv o\'lchami'); $('#top').appendChild(btn);
  btn.onclick = e => { e.stopPropagation(); big = big === '1' ? '0' : '1'; try { localStorage.setItem('big', big); } catch (er) {} apply(); buzz(); };
  apply();
})();

/* ================================================================== start */
(async () => {
  try {
    S.me = await api('/api/me');
    $('#hello').textContent = 'Salom, ' + S.me.name;
    if (!S.me.allowed) {
      $('#dock') && $('#dock').classList.add('hidden');
      $('#top') && ($('#top').style.display = 'none');
      render(`<div style="text-align:center;padding:6px 0 90px"><video src="/static/promo.mp4" autoplay muted loop playsinline webkit-playsinline style="width:100%;max-width:420px;border-radius:26px;box-shadow:0 18px 44px rgba(90,40,10,.35);background:#f4a36e"></video>
        <div class="card" style="margin-top:14px"><b>🔒 Zakas bo'limi faqat savdo agentlari uchun</b><div class="mut" style="margin-top:6px">Ruxsat olish uchun ID raqamingizni adminga yuboring:</div><div style="font-size:24px;font-weight:800;margin-top:6px">${S.me.id}</div></div></div>`);
      return;
    }
    api('/api/products').then(r => { S.products = r.items; banner && banner.refresh(); }).catch(() => {});
    home();
  } catch (e) {
    render(`<div class="card" data-a>Kirish xatosi: ${esc(e.message)}<div class="mut" style="margin-top:6px">Ilovani Telegram ichidan oching.</div></div>`);
  }
})();
