/* MeatCity Jizzax — Online zakas Mini App (v2: animatsiyali) */
const tg = window.Telegram && Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('#F4F5F9'); tg.setBackgroundColor('#F4F5F9'); } catch (e) {} }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEV = new URLSearchParams(location.search).get('dev');
const APP = !DEV && !(tg && tg.initData);                  // Telegram'dan tashqari (APK yoki brauzer) — bot kodi bilan kirish
const NATIVE = window.AndroidApp || null;                  // APK ichidagi Android ko'prigi (barmoq izi, orqaga tugmasi)
const BOT_NAME = 'Online_zakas_jizzax_bot';
const tokenGet = () => { try { return localStorage.getItem('app_token') || ''; } catch (e) { return ''; } };
const tokenSet = v => { try { v ? localStorage.setItem('app_token', v) : localStorage.removeItem('app_token'); } catch (e) {} };
const ST = { new: ['🆕 Qabul qilindi', .08], collecting: ['📦 Yig\'ilmoqda', .35], on_way: ['🚚 Yo\'lda', .68], delivered: ['✅ Yetkazildi', 1] };
const buzz = (t = 'light') => { try { tg && tg.HapticFeedback.impactOccurred(t); } catch (e) {} };

async function api(path, opts = {}) {
  const headers = { 'X-Init-Data': tg ? tg.initData : '', ...(opts.headers || {}) };
  if (DEV) headers['X-Dev-User'] = DEV;
  if (APP && tokenGet()) headers['X-App-Token'] = tokenGet();
  if (opts.json) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const isGet = !opts.method || opts.method === 'GET';
  const tries = opts.retry != null ? opts.retry : (isGet ? 2 : 0);   // GET: server uyg'onguncha qayta urinadi
  let r, lastErr;
  for (let i = 0; i <= tries; i++) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), opts.timeout || (isGet ? 30000 : 60000));
    try {
      r = await fetch(path, { ...opts, headers, signal: ac.signal });
      clearTimeout(tm);
      if (r.status >= 502 && r.status <= 504 && i < tries) { await sleep(1500 * (i + 1)); continue; }   // Render uyg'onmoqda
      lastErr = null; break;
    } catch (e) {
      clearTimeout(tm);
      lastErr = new Error(navigator.onLine === false ? "Internet yo'q. Aloqani tekshirib, qayta urining" : "Server javob bermadi. Qayta urinib ko'ring");
      lastErr.network = true;
      if (i < tries) await sleep(1500 * (i + 1));
    }
  }
  if (lastErr) throw lastErr;
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && APP) { tokenSet(''); loginView(); throw new Error('Qayta kiring'); }
  if (!r.ok) throw new Error(data.error || ('Xato ' + r.status));
  return data;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2300); }

/* ================================================================== xatolarni kuzatish, internet holati */
let _logN = 0;
function clientLog(msg, at) { if (_logN++ > 20) return; try { fetch('/api/clientlog', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Init-Data': tg ? tg.initData : '', ...(APP && tokenGet() ? { 'X-App-Token': tokenGet() } : {}) }, body: JSON.stringify({ msg: String(msg).slice(0, 300), at: String(at || '').slice(0, 200) }) }).catch(() => {}); } catch (e) {} }
window.addEventListener('error', e => clientLog(e.message, (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => clientLog('promise: ' + ((e.reason && e.reason.message) || e.reason), ''));
function netBanner() { let b = document.getElementById('offline'); if (!b) { b = document.createElement('div'); b.id = 'offline'; b.textContent = "📡 Internet yo'q — zakas yuborish uchun aloqani tekshiring"; document.body.appendChild(b); } b.classList.toggle('show', navigator.onLine === false); }
window.addEventListener('online', () => { netBanner(); toast('✅ Internet qaytdi'); });
window.addEventListener('offline', netBanner);

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
const S = { notes: {}, me: null, products: [], cat: 'Hammasi', q: '', cart: JSON.parse(localStorage.getItem('cart') || '{}'), client: null, region: '', tab: 'all', timer: null, stats: { n: 0, sum: 0, way: 0 }, mode: 'order', prodAgent: '', runit: {}, ret: { agent: '', client: '', ptype: '', photos: [], comment: '' } };
const RET = () => S.mode === 'ret';                       // skladchi: vozvrat rejimi (savat o'rniga "Qaytarish")
const saveCart = () => { try { localStorage.setItem(RET() ? 'rcart' : 'cart', JSON.stringify(S.cart)); } catch (e) {} };
function useMode(m) { if (S.mode === m) return; S.mode = m; try { S.cart = JSON.parse(localStorage.getItem(m === 'ret' ? 'rcart' : 'cart') || '{}'); } catch (e) { S.cart = {}; } }
const view = $('#view');
const ru = p => S.runit[p.id] || p.unit;                       // agent / skladchi shu zakas uchun tanlagan birlik (dona/kg)
const stepOf = p => p && ru(p) === 'kg' ? .5 : 1;
const fq = v => (+v).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
let _uh;
function unitHint(t, kg) {                                  // kichik qisqa yozuv: ekran pastida, hamma narsa ustida
  let e = document.getElementById('uh'); if (!e) { e = document.createElement('div'); e.id = 'uh'; document.body.appendChild(e); }
  e.textContent = (kg ? '⚖️ ' : '🔢 ') + t; e.className = kg ? 'kg' : 'dn'; void e.offsetWidth; e.classList.add('on');
  clearTimeout(_uh); _uh = setTimeout(() => e.classList.remove('on'), 1300);
}
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
window.onAndroidBack = () => { const lk = document.getElementById('lock'); if (lk && !lk.classList.contains('hidden')) return false; if (backFn) { backFn(); return true; } return false; };
const cartSum = () => Object.entries(S.cart).reduce((s, [id, q]) => { const p = S.products.find(p => p.id === id); return s + (p ? p.price * q : 0); }, 0);
const cartCount = () => Object.keys(S.cart).length;
let lastCart = '';
function updateCartBar(show) {
  const bar = $('#cartbar'), n = cartCount();
  bar.classList.toggle('hidden', !(show && n));
  const label = RET() ? `↩️ Qaytarish: ${n} ta · ${money(cartSum())} so'm →` : `🛒 Savat: ${n} ta · ${money(cartSum())} so'm →`;
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
$$('#dock button').forEach(b => b.onclick = () => { buzz(); const dk = $('#dock'); if (dk.classList.contains('mini')) { dk.classList.remove('mini'); redock(); return; } (S.me && S.me.role === 'sklad' ? { home: retHome, new: retNew, profile: profileView, notes: notesView } : { home, new: newOrder, admin: adminView, profile: profileView, notes: notesView })[b.dataset.d](); });
// pastga aylantirilganda dock yig'iladi (faqat faol tugma qoladi), tepaga aylantirilsa yoki bosilsa ochiladi
let lastY = 0; addEventListener('scroll', () => { const y = scrollY, d = y - lastY; lastY = y; const dk = $('#dock'); if (dk.classList.contains('hidden')) return; const m = dk.classList.contains('mini'); if (!m && d > 8 && y > 90) { dk.classList.add('mini'); redock(); } else if (m && d < -8) { dk.classList.remove('mini'); redock(); } }, { passive: true });
addEventListener('resize', () => { const on = $('#dock button.on'); on && setDock(on.dataset.d); });

/* ================================================================== bosh sahifa */
function paintTabsPill() {
  const t = $('.tabs'); if (!t) return; const on = $('.tab.on', t), p = $('.pill', t);
  p.style.left = on.offsetLeft + 'px'; p.style.width = on.offsetWidth + 'px';
}
async function home() {
  if (S.me.role === 'sklad') return retHome();
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
  if (S.me.role === 'sklad') return retNew();
  useMode('order'); if (S.prodAgent) { S.prodAgent = ''; S.products = []; }
  clearTimer(); setBack(home); updateCartBar(false); setDock('new'); banner && banner.setProgress(null);
  S.region = S.me.admin ? (S.me.region || '') : (S.me.agent || ''); let agents = [];
  try { agents = (await api('/api/regions')).items; } catch (e) {}
  render(`
    <div class="steps" data-a><span class="on">1. Mijoz</span><span>2. Mahsulot</span><span>3. Tasdiq</span></div>
    <input id="q" placeholder="🔍 Mijoz nomini yozing…" autocomplete="off" data-a>
    <div class="chips" id="regs" data-a></div>
    <button class="btn addmore" id="ncBtn" data-a>➕ Yangi mijoz qo'shish</button>
    <div class="card ncform" id="ncForm" style="display:none"><b>➕ Yangi mijoz</b>
      <input id="ncN" placeholder="Mijoz nomi (do'kon) *" autocomplete="off" style="margin-top:8px">
      <input id="ncP" placeholder="Telefon" inputmode="tel" autocomplete="off" style="margin-top:6px">
      <input id="ncR" placeholder="Territoriya (masalan: Paxtakor)" autocomplete="off" style="margin-top:6px">
      <input id="ncA" placeholder="Manzil / mo'ljal" autocomplete="off" style="margin-top:6px">
      ${S.me.admin ? `<select id="ncG" style="margin-top:6px;width:100%"><option value="">Agentni tanlang *</option>${agents.map(r => `<option ${S.region === r.region ? 'selected' : ''}>${esc(r.region)}</option>`).join('')}</select>` : ''}
      <button class="btn" id="ncSave" style="margin-top:10px;width:100%">✅ Qo'shish</button></div>
    <div id="ncList"></div>
    <div id="res"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`);
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
  const pick = c => { buzz('medium'); S.client = c; pickProducts(); };
  const loadNew = async () => {
    try {
      const { items } = await api('/api/clients/new');
      $('#ncList').innerHTML = items.length ? `<div class="nchead">🆕 Yangi mijozlar</div>` + items.map(c => `<div class="client nc" data-nid="${c.id}"><b>${esc(c.name)} <span class="newtag">YANGI</span></b><div class="mut">${S.me.admin && c.agent ? '🧑‍💼 ' + esc(c.agent) + ' · ' : ''}${esc(c.region)} ${esc(c.phone)}</div></div>`).join('') : '';
      $$('#ncList .client').forEach(el => el.onclick = () => pick(items.find(c => c.id == el.dataset.nid)));
    } catch (e) {}
  };
  $('#ncBtn').onclick = () => { const f = $('#ncForm'), open = f.style.display === 'none'; f.style.display = open ? '' : 'none'; $('#ncBtn').textContent = open ? '✕ Yopish' : '➕ Yangi mijoz qo\'shish'; if (open) { $('#ncN').value = $('#ncN').value || $('#q').value; $('#ncN').focus(); } };
  $('#ncSave').onclick = async () => {
    const b = $('#ncSave'); if (b.disabled) return;
    const json = { name: $('#ncN').value, phone: $('#ncP').value, region: $('#ncR').value, address: $('#ncA').value };
    if (S.me.admin) json.agent = $('#ncG').value;
    b.disabled = true;
    try {
      const { client } = await api('/api/clients', { method: 'POST', json });
      toast('✅ Mijoz qo\'shildi'); buzz('medium');
      ['#ncN', '#ncP', '#ncR', '#ncA'].forEach(s => $(s).value = ''); $('#ncForm').style.display = 'none'; $('#ncBtn').textContent = '➕ Yangi mijoz qo\'shish';
      await loadNew(); search();
    } catch (e) { toast(e.message); }
    b.disabled = false;
  };
  drawRegs(); search(); loadNew();
}

/* ================================================================== 2) mahsulotlar */
async function pickProducts() {
  const R = RET(), purl = R ? '/api/products?agent=' + encodeURIComponent(S.ret.agent) : '/api/products';
  setBack(R ? retNew : newOrder); setDock(null);
  if (!S.products.length || (R && S.prodAgent !== S.ret.agent)) {
    render('<div class="grid">' + '<div class="sk" style="height:220px;border-radius:22px"></div>'.repeat(4) + '</div>');
    try { const r = await api(purl); S.products = r.items; if (R) { S.prodAgent = S.ret.agent; S.ret.ptype = r.ptype || ''; } } catch (e) { toast(e.message); return; }
  } else api(purl).then(r => { S.products = r.items; }).catch(() => {});
  const cats = ['Hammasi', ...new Set(S.products.map(p => p.category))];
  render(`
    <div class="steps" data-a><span>1. ${R ? 'Agent' : 'Mijoz'}</span><span class="on">2. Mahsulot</span><span>3. Tasdiq</span></div>
    ${R ? `<div class="card retcard" style="margin-top:0" data-a><b>↩️ ${esc(S.ret.client)}</b><div class="mut">🧑‍💼 ${esc(S.ret.agent)}${S.ret.ptype ? ' · 💲 ' + esc(S.ret.ptype) : ''}</div></div>` : `<div class="card" style="margin-top:0" data-a><b>${esc(S.client.name)}</b> <span class="mut">${S.client.agent ? '🧑‍💼 ' + esc(S.client.agent) : esc(S.client.region)}</span></div>`}
    <input id="pq" placeholder="🔍 Mahsulot qidirish…" value="${esc(S.q)}" data-a>
    <div class="chips" id="cats" data-a>${cats.map(c => `<div class="chip ${c === S.cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</div>`).join('')}</div>
    <div class="grid" id="grid"></div><div id="sent" style="height:1px"></div>`);
  document.body.classList.add('pick'); setTimeout(() => dispatchEvent(new Event('resize')), 60);
  let shown = 0, list = [];
  const cardHtml = p => `
      <div class="prod ${S.cart[p.id] ? 'sel' : ''}" data-id="${p.id}">
        <div class="im ${p.image ? 'has' : ''}">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" onload="this.classList.add('ok')" onerror="this.remove()">` : '🥩'}<span class="tag">${esc(p.category)}</span>${p.image ? '<span class="play">▶ Reklama</span>' : ''}</div>
        <div class="in"><div class="nm">${esc(p.name)}</div><div class="pr">${money(p.price)} so'm / <span class="pr-u ${ru(p) === 'kg' ? 'u-kg' : 'u-dona'}">${ru(p) === 'kg' ? '⚖️ KG' : '🔢 DONA'}</span></div>
          ${(() => { const s = !R && stockInfo(p); return s ? `<div class="stk ${s.cls}">${s.text}</div>` : ''; })()}
          <div class="qty"><button data-d="-1">−</button><input type="number" inputmode="decimal" min="0" step="any" value="${S.cart[p.id] || ''}" placeholder="0"><button data-d="1">+</button><i class="un">${ru(p) === 'kg' ? 'kg' : 'dona'}</i></div>
          <div class="useg ${R ? '' : 'ord'}"><button data-u="dona" class="${ru(p) === 'dona' ? 'on' : ''}">🔢 Dona</button><button data-u="kg" class="${ru(p) === 'kg' ? 'on' : ''}">⚖️ Kg</button></div>
          <div class="warn ${!R && shortOf(p, S.cart[p.id]) ? 'on' : ''}">⚠️ Yetmaydi: ${fq(shortOf(p, S.cart[p.id]))} · zakas baribir yoziladi</div>
          <button class="add ${R ? 'retb' : ''}">${R ? '↩️ Qaytarish' : 'Savatga'}</button></div>
      </div>`;
  const bindCard = (card, p) => {
    const id = card.dataset.id, inp = $('input', card);
    const warn = $('.warn', card);
    const set = v => { v = Math.max(0, +(+v || 0).toFixed(3)); if (v) S.cart[id] = v; else delete S.cart[id]; inp.value = v || ''; card.classList.toggle('sel', !!v); const sh = R ? 0 : shortOf(p, v); warn.classList.toggle('on', !!sh); warn.textContent = `⚠️ Yetmaydi: ${fq(sh)} · zakas baribir yoziladi`; saveCart(); updateCartBar(true); buzz(); };
    $$('[data-d]', card).forEach(b => b.onclick = () => set((+inp.value || 0) + +b.dataset.d * stepOf(p)));
    $$('.useg button', card).forEach(b => b.onclick = e => {          // vozvrat: faqat shu qaytarish uchun birlik
      e.stopPropagation(); S.runit[p.id] = b.dataset.u; buzz();
      $$('.useg button', card).forEach(x => x.classList.toggle('on', x === b));
      const k = b.dataset.u === 'kg', pu = $('.pr-u', card); pu.textContent = k ? '⚖️ KG' : '🔢 DONA'; pu.className = 'pr-u ' + (k ? 'u-kg' : 'u-dona');
      $('.qty .un', card).textContent = k ? 'kg' : 'dona'; unitHint(k ? 'kg' : 'dona', k);
    });
    const ub = $('.unb', card);
    const paintUnit = flash => { const k = p.unit === 'kg'; if (ub) ub.textContent = `🔄 ${k ? 'kg → dona' : 'dona → kg'}${p.unit_set ? '' : ' ?'}`; const pu = $('.pr-u', card); pu.textContent = k ? '⚖️ KG' : '🔢 DONA'; pu.className = 'pr-u ' + (k ? 'u-kg' : 'u-dona'); $('.qty .un', card).textContent = k ? 'kg' : 'dona'; if (flash) { if (card.animate) { card.animate([{ boxShadow: '0 0 0 0 rgba(238,122,47,0)' }, { boxShadow: '0 0 0 10px rgba(238,122,47,.45)', offset: .25 }, { boxShadow: '0 0 0 0 rgba(238,122,47,0)' }], { duration: 900 }); pu.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.35)', offset: .5 }, { transform: 'scale(1)' }], { duration: 700, easing: 'cubic-bezier(.3,1.6,.5,1)' }); } unitHint(k ? 'dona → kg' : 'kg → dona', k); } };
    if (ub) ub.onclick = async e => {                      // kartochka qayta chizilmaydi (animatsiyasiz) — faqat yozuv almashadi
      e.stopPropagation(); const old = [p.unit, p.unit_set], nu = p.unit === 'kg' ? 'dona' : 'kg';
      p.unit = nu; p.unit_set = true; paintUnit(true); buzz();
      try { await api(`/api/products/${p.id}/unit`, { method: 'PUT', json: { unit: nu } }); } catch (er) { [p.unit, p.unit_set] = old; paintUnit(); toast(er.message); }
    };
    inp.onchange = () => set(inp.value);
    $('.add', card).onclick = () => { if (!+inp.value) set(stepOf(p) === .5 ? 1 : 1); fly($('.im', card)); };
    if (p.image) $('.im', card).onclick = () => {
      buzz('medium'); const prev = backFn;
      setBack(() => window.__adClose && window.__adClose()); window.__adBack = () => setBack(prev);
      window.openAd(p, () => { if (!+inp.value) set(1); toast(R ? 'Qaytarishga qo\'shildi' : 'Savatga qo\'shildi'); });
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
    const rank = p => R ? 0 : p.stock != null && p.stock > 0 ? 0 : p.stock == null ? 1 : 2;     // avval skladda borlar, keyin qoldig'i noma'lum, oxirida yo'qlar
    list = list.map((p, i) => [p, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(x => x[0]);
    shown = 0; $('#grid').innerHTML = '';
    if (!list.length) { $('#grid').innerHTML = '<div class="mut" style="grid-column:1/-1;text-align:center;padding:24px">Hech narsa topilmadi</div>'; return; }
    more();
    if (io) { io.disconnect(); io.observe($('#sent')); } else while (shown < list.length) more();
  };
  $$('#cats .chip').forEach(c => c.onclick = () => { S.cat = c.dataset.c; buzz(); $$('#cats .chip').forEach(x => x.classList.toggle('on', x === c)); draw(); });
  let pqT; $('#pq').oninput = e => { S.q = e.target.value; clearTimeout(pqT); pqT = setTimeout(draw, 140); };
  $('#cartBtn').onclick = R ? retConfirm : confirmView;
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
  if (RET()) return retConfirm();
  setBack(pickProducts); updateCartBar(false); setDock(null);
  const draw = () => {
    const rows = Object.entries(S.cart).map(([id, q]) => ({ p: S.products.find(p => p.id === id), id, q })).filter(r => r.p);
    render(`
      <div class="steps" data-a><span>1. Mijoz</span><span id="toPick" style="cursor:pointer">2. Mahsulot</span><span class="on">3. Tasdiq</span></div>
      <div class="card" data-a><b>${esc(S.client.name)}</b><div class="mut">${S.client.agent ? '🧑‍💼 ' + esc(S.client.agent) : ''} ${esc(S.client.region)}</div></div>
      <button class="btn addmore" id="addMore" data-a>➕ Yana mahsulot qo'shish</button>
      ${rows.map(r => { const s = stockInfo(r.p), sh = shortOf(r.p, r.q); return `<div class="card" data-a><div class="row"><b>${esc(r.p.name)}</b><button class="back" data-rm="${r.id}">✕</button></div>
        ${s ? `<div class="stk ${s.cls}">${s.text}</div>` : ''}
        <div class="row"><span class="mut">${money(r.p.price)} × </span><div class="qty" style="flex:1;max-width:240px;margin:0 8px"><button data-m="${r.id}">−</button><input type="number" step="any" inputmode="decimal" value="${r.q}" data-i="${r.id}"><button data-p="${r.id}">+</button><i class="un">${ru(r.p) === 'kg' ? 'kg' : 'dona'}</i></div><b>${money(r.p.price * r.q)}</b></div></div>`; }).join('') || '<div class="mut" data-a>Savat bo\'sh</div>'}
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
    initDD(); $('#addMore').onclick = () => { buzz(); pickProducts(); }; $('#toPick').onclick = () => pickProducts();
    $$('[data-n]').forEach(i => i.oninput = () => { S.notes[i.dataset.n] = i.value; });
    $$('[data-rm]').forEach(b => b.onclick = () => chg(b.dataset.rm, 0));
    $$('[data-m]').forEach(b => b.onclick = () => chg(b.dataset.m, S.cart[b.dataset.m] - stepOf(S.products.find(p => p.id === b.dataset.m))));
    $$('[data-p]').forEach(b => b.onclick = () => chg(b.dataset.p, S.cart[b.dataset.p] + stepOf(S.products.find(p => p.id === b.dataset.p))));
    $$('[data-i]').forEach(i => i.onchange = () => chg(i.dataset.i, i.value));
    $('#send').onclick = async () => {
      if ($('#send').disabled) return;
      $('#send').disabled = true; const txt = $('#send').textContent; $('#send').textContent = '⏳ Yuborilmoqda…';
      try {
        let rid = LS.get('req_id'); if (!rid) { rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); LS.set('req_id', rid); }   // bitta zakas = bitta ID
        const items = Object.entries(S.cart).map(([id, qty]) => ({ id, qty, note: S.notes[id] || '', unit: S.runit[id] || (S.products.find(p => p.id === id) || {}).unit }));
        const local = items.reduce((s, it) => { const p = S.products.find(x => x.id === it.id); return s + (p ? p.price * it.qty : 0); }, 0);
        const res = await api('/api/orders', { method: 'POST', retry: 3, json: { client_id: S.client.id, items, comment: $('#cm').value, ddate: window.__dd, req_id: rid } });
        const order = res.order;
        LS.set('req_id', null);
        S.cart = {}; S.notes = {}; S.runit = {}; saveCart(); S.client = null; buzz('heavy'); confetti();
        toast(res.duplicate ? 'Zakas avval yuborilgan edi ✅' : res.skipped ? `Zakas yuborildi ✅ (${res.skipped} ta mahsulot topilmadi)` : Math.round(local) !== Math.round(order.total) ? 'Zakas yuborildi ✅ Narx yangilangan: ' + money(order.total) : 'Zakas yuborildi ✅');
        S.tab = 'mine'; detail(order); banner && banner.setProgress(ST.new[1]);
      } catch (e) { toast(e.network ? e.message + ' — savat saqlangan' : e.message); $('#send').disabled = false; $('#send').textContent = txt; }
    };
  };
  draw();
}

/* ================================================================== VOZVRAT (skladchi) */
const RST = { pending: ['⏳ Tasdiq kutilmoqda', 'new'], approved: ['✅ Tasdiqlandi', 'delivered'], rejected: ['❌ Rad etildi', 'rej'] };
async function retHome() {
  clearTimer(); setBack(null); updateCartBar(false); setDock('home'); banner && banner.setProgress(null); useMode('ret');
  S.stab = S.stab || 'ret';
  render(`
    <div class="sk2" data-a><button class="btn retbtn" id="rnew">↩️ Vozvrat</button><button class="btn otkbtn" id="onew">🚫 Otkaz zakas</button></div>
    <div class="tabs" data-a><i class="pill"></i><div class="tab ${S.stab === 'ret' ? 'on' : ''}" data-t="ret">Vozvratlar</div><div class="tab ${S.stab === 'otk' ? 'on' : ''}" data-t="otk">Otkazlar</div></div>
    <div id="list"><div class="sk"></div><div class="sk"></div></div>`);
  $('#rnew').onclick = retNew; $('#onew').onclick = otkNew;
  setTimeout(paintTabsPill, 30);
  let sig = '';
  $$('.tab').forEach(t => t.onclick = () => { S.stab = t.dataset.t; $$('.tab').forEach(x => x.classList.toggle('on', x === t)); paintTabsPill(); buzz(); sig = ''; load(); });
  const tm = t => new Date(t * 1000).toLocaleString('uz', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const load = async () => {
    const tab = S.stab;
    try {
      const { items } = await api(tab === 'ret' ? '/api/returns' : '/api/otkaz');
      if (tab !== S.stab) return;
      const ns = tab + JSON.stringify(items.map(r => [r.id, r.status || r.sent])); if (ns === sig) return; sig = ns;
      $('#list').innerHTML = !items.length ? `<div class="mut" style="text-align:center;padding:30px">${tab === 'ret' ? 'Hali vozvrat kiritilmagan' : 'Hali otkaz kiritilmagan'}</div>` : tab === 'ret' ? items.map(r => `
        <div class="card rise">
          <div class="row"><b>R-${r.id} · ${esc(r.client_name)}</b><span class="badge s-${RST[r.status][1]}">${RST[r.status][0]}</span></div>
          <div class="mut">🧑‍💼 ${esc(r.agent)} · ${tm(r.created)}</div>
          ${r.client_typed && r.client_typed !== r.client_name ? `<div class="mut" style="font-size:12px">Yozilgan: ${esc(r.client_typed)}</div>` : ''}
          <div class="row" style="margin-top:6px"><span class="mut">${r.items.length} ta mahsulot</span><b>${money(r.total)} so'm</b></div>
          ${r.status === 'rejected' && r.reason ? `<div class="stk out" style="margin-top:6px">Sabab: ${esc(r.reason)}</div>` : ''}
        </div>`).join('') : items.map(o => `
        <div class="card rise otkcard">
          <div class="row"><b>🚫 Zakas № ${esc(o.order_no)}</b><span class="badge ${o.sent ? 's-delivered' : 's-new'}">${o.sent ? '✅ Guruhga ketdi' : '📋 Saqlandi'}</span></div>
          <div class="mut">🏪 ${esc(o.client_name)} · ${tm(o.created)} · 📷 ${o.photos.length}</div>
          ${o.comment ? `<div class="mut" style="font-size:12px">💬 ${esc(o.comment)}</div>` : ''}
        </div>`).join('');
    } catch (e) { $('#list').innerHTML = `<div class="mut">${esc(e.message)}</div>`; }
  };
  await load(); S.timer = setInterval(load, 25000);
}

async function otkNew() {                          // otkaz zakas: mijoz + zakas raqami + mahsulot rasmlari
  clearTimer(); setBack(retHome); updateCartBar(false); setDock(null);
  const O = S.otk = S.otk || { client: '', no: '', photos: [], comment: '' };
  const draw = () => {
    render(`
      <h2 data-a style="margin:4px 0 10px">🚫 Otkaz zakas</h2>
      <div class="card otkcard" data-a>
        <b>🏪 Mijoz nomi</b><input id="oc" placeholder="Masalan: 25-do'kon" autocomplete="off" value="${esc(O.client)}" style="margin-top:6px">
        <b style="display:block;margin-top:12px">🧾 Zakas raqami</b><input id="on" placeholder="Masalan: 1254" autocomplete="off" inputmode="text" value="${esc(O.no)}" style="margin-top:6px"></div>
      <div class="card otkcard" data-a><b>📷 Mahsulot rasmi</b>
        <div class="mut" style="font-size:13px;margin-top:4px">Qaytgan mahsulotni rasmga oling — kamera ochiladi.</div>
        <div class="phgrid">${O.photos.map((u, i) => `<div class="ph"><img src="${u}" alt=""><button data-px="${i}">✕</button></div>`).join('')}
          ${O.photos.length < 10 ? `<button class="phadd otk" id="shot"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>${O.photos.length ? 'Yana' : 'Rasmga olish'}</span></button>` : ''}</div></div>
      <textarea id="ocm" rows="2" placeholder="💬 Izoh (ixtiyoriy): sababi" data-a>${esc(O.comment)}</textarea>
      <button class="btn otkbtn" id="osend" data-a style="margin-top:12px">🚫 Otkazni yuborish</button>`);
    $('#oc').oninput = e => { O.client = e.target.value; };
    $('#on').oninput = e => { O.no = e.target.value; };
    $('#ocm').oninput = e => { O.comment = e.target.value; };
    $$('[data-px]').forEach(b => b.onclick = () => { O.photos.splice(+b.dataset.px, 1); buzz(); draw(); });
    const shot = $('#shot'); if (shot) shot.onclick = () => openCamera(u => { if (O.photos.length >= 10) return; O.photos.push(u); O._dirty = true; });
    $('#osend').onclick = async () => {
      const b = $('#osend'); if (b.disabled) return;
      if (O.client.trim().length < 2) { $('#oc').focus(); return toast('Mijoz nomini yozing'); }
      if (!O.no.trim()) { $('#on').focus(); return toast('Zakas raqamini yozing'); }
      if (!O.photos.length) return toast('Mahsulotni rasmga oling');
      b.disabled = true; b.textContent = '⏳ Yuborilmoqda…';
      try {
        let rid = LS.get('oreq_id'); if (!rid) { rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); LS.set('oreq_id', rid); }
        const r = await api('/api/otkaz', { method: 'POST', retry: 2, timeout: 120000, json: { client_name: O.client, order_no: O.no, photos: O.photos, comment: O.comment, req_id: rid } });
        LS.set('oreq_id', null); S.otk = null; buzz('heavy'); confetti();
        toast(r.warn ? '✅ Saqlandi (guruhga ketmadi: ' + r.warn + ')' : '✅ Otkaz guruhga yuborildi'); S.stab = 'otk'; retHome();
      } catch (e) { toast(e.message); b.disabled = false; b.textContent = '🚫 Otkazni yuborish'; }
    };
  };
  draw();
  const iv = setInterval(() => { if (S.otk !== O || !document.getElementById('osend')) return clearInterval(iv); if (!document.getElementById('cam') && O._dirty) { O._dirty = false; draw(); } }, 300);
}

async function retNew() {
  clearTimer(); setBack(retHome); updateCartBar(false); setDock('new'); useMode('ret');
  render(`
    <div class="steps" data-a><span class="on">1. Agent</span><span>2. Mahsulot</span><span>3. Tasdiq</span></div>
    <div class="nchead" data-a>Qaysi agentning mijozi qaytardi?</div>
    <div id="agl" data-a><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>
    <div class="card" data-a><b>🏪 Mijoz (do'kon) nomi</b>
      <input id="rcl" placeholder="Masalan: 25-do'kon, Anvar aka" autocomplete="off" value="${esc(S.ret.client)}" style="margin-top:8px">
      <div class="mut" style="font-size:12px;margin-top:6px">Bilganingizcha yozing — admin tasdiqlashda bazadagi mijozga bog'laydi.</div></div>
    <button class="btn" id="rgo" data-a>Davom etish →</button>`);
  let agents = [];
  try { agents = (await api('/api/ret/agents')).items; } catch (e) { $('#agl').innerHTML = `<div class="mut">${esc(e.message)}</div>`; return; }
  const draw = () => {
    $('#agl').innerHTML = agents.map(a => `<div class="client agc ${S.ret.agent === a.agent ? 'on' : ''}" data-ag="${esc(a.agent)}"><b>🧑‍💼 ${esc(a.agent)}</b><div class="mut">${a.ptype ? '💲 Narx turi: ' + esc(a.ptype) : 'Narx turi biriktirilmagan (asosiy narx)'}</div></div>`).join('') || '<div class="mut">Agentlar topilmadi</div>';
    $$('#agl [data-ag]').forEach(el => el.onclick = () => { buzz('medium'); if (S.ret.agent !== el.dataset.ag) { S.cart = {}; saveCart(); } S.ret.agent = el.dataset.ag; draw(); });
  };
  draw();
  $('#rcl').oninput = e => { S.ret.client = e.target.value; };
  $('#rgo').onclick = () => {
    S.ret.client = $('#rcl').value.trim();
    if (!S.ret.agent) return toast('Agentni tanlang');
    if (S.ret.client.length < 2) { $('#rcl').focus(); return toast('Mijoz nomini yozing'); }
    buzz('medium'); pickProducts();
  };
}

function shrink(src, max = 1280) {                 // rasmni kichraytirib JPEG qiladi (internetni tejaydi)
  return new Promise((res, rej) => {
    const go = img => { const k = Math.min(1, max / Math.max(img.width || img.videoWidth, img.height || img.videoHeight)); const w = Math.round((img.width || img.videoWidth) * k), h = Math.round((img.height || img.videoHeight) * k); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); res(c.toDataURL('image/jpeg', .78)); };
    if (src instanceof HTMLVideoElement) return go(src);
    const im = new Image(); im.onload = () => { go(im); URL.revokeObjectURL(im.src); }; im.onerror = () => rej(new Error('Rasm o\'qilmadi')); im.src = URL.createObjectURL(src);
  });
}
function fileCamera(onShot) {                      // zaxira: telefonning o'z kamera oynasi
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment');
  i.onchange = async () => { const f = i.files[0]; if (!f) return; try { onShot(await shrink(f)); } catch (e) { toast(e.message); } };
  i.click();
}
async function openCamera(onShot) {                // ilova ichida jonli kamera: bosildi — rasm tushdi
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return fileCamera(onShot);
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
  catch (e) { return fileCamera(onShot); }
  const box = document.createElement('div'); box.id = 'cam';
  box.innerHTML = `<video autoplay playsinline muted></video><div class="camflash"></div>
    <div class="cambar"><button class="camx" aria-label="Yopish">✕</button><button class="camshot" aria-label="Rasmga olish"><i></i></button><span class="camn"></span></div>`;
  document.body.appendChild(box);
  const v = $('video', box); v.srcObject = stream;
  let n = 0;
  const close = () => { stream.getTracks().forEach(t => t.stop()); box.remove(); if (prevBack !== undefined) setBack(prevBack); };
  const prevBack = backFn; setBack(close);
  $('.camx', box).onclick = close;
  $('.camshot', box).onclick = async () => {
    if (!v.videoWidth) return;
    buzz('heavy'); const fl = $('.camflash', box); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
    onShot(await shrink(v)); n++; $('.camn', box).textContent = n + ' ta ✓';
  };
}

function retConfirm() {
  setBack(pickProducts); updateCartBar(false); setDock(null);
  const draw = () => {
    const rows = Object.entries(S.cart).map(([id, q]) => ({ p: S.products.find(p => p.id === id), id, q })).filter(r => r.p);
    render(`
      <div class="steps" data-a><span>1. Agent</span><span id="toPick" style="cursor:pointer">2. Mahsulot</span><span class="on">3. Tasdiq</span></div>
      <div class="card retcard" data-a><b>↩️ ${esc(S.ret.client)}</b><div class="mut">🧑‍💼 ${esc(S.ret.agent)}${S.ret.ptype ? ' · 💲 ' + esc(S.ret.ptype) : ''}</div></div>
      <button class="btn addmore" id="addMore" data-a>➕ Yana mahsulot qo'shish</button>
      ${rows.map(r => `<div class="card" data-a><div class="row"><b>${esc(r.p.name)}</b><button class="back" data-rm="${r.id}">✕</button></div>
        <div class="qty" style="margin:8px 0 6px"><button data-m="${r.id}">−</button><input type="number" step="any" inputmode="decimal" value="${r.q}" data-i="${r.id}"><button data-p="${r.id}">+</button><i class="un">${ru(r.p) === 'kg' ? 'kg' : 'dona'}</i></div>
        <div class="row"><span class="mut">${money(r.p.price)} so'm × ${fq(r.q)} ${ru(r.p) === 'kg' ? 'kg' : 'dona'}</span><b>${money(r.p.price * r.q)} so'm</b></div></div>`).join('') || '<div class="mut" data-a>Hech narsa tanlanmagan</div>'}
      <textarea id="cm" rows="2" placeholder="💬 Sabab / izoh (masalan: muddati o'tgan, sifatsiz)" data-a>${esc(S.ret.comment)}</textarea>
      <div class="row" style="margin:14px 0" data-a><span>Jami</span><span class="sum"><span id="tot">0</span> so'm</span></div>
      <button class="btn retbtn" id="send" data-a ${rows.length ? '' : 'disabled'}>↩️ Qaytarishni tasdiqqa yuborish</button>`);
    countTo($('#tot'), cartSum(), { dur: 600 });
    const chg = (id, v) => { v = Math.max(0, +(+v || 0).toFixed(3)); if (v) S.cart[id] = v; else delete S.cart[id]; saveCart(); buzz(); draw(); };
    $('#addMore').onclick = () => { buzz(); pickProducts(); }; $('#toPick').onclick = () => pickProducts();
    $('#cm').oninput = e => { S.ret.comment = e.target.value; };
    $$('[data-rm]').forEach(b => b.onclick = () => chg(b.dataset.rm, 0));
    $$('[data-m]').forEach(b => b.onclick = () => chg(b.dataset.m, S.cart[b.dataset.m] - stepOf(S.products.find(p => p.id === b.dataset.m))));
    $$('[data-p]').forEach(b => b.onclick = () => chg(b.dataset.p, S.cart[b.dataset.p] + stepOf(S.products.find(p => p.id === b.dataset.p))));
    $$('[data-i]').forEach(i => i.onchange = () => chg(i.dataset.i, i.value));
    $('#send').onclick = async () => {
      const b = $('#send'); if (b.disabled) return;
      b.disabled = true; const txt = b.textContent; b.textContent = '⏳ Yuborilmoqda…';
      try {
        let rid = LS.get('rreq_id'); if (!rid) { rid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); LS.set('rreq_id', rid); }
        const items = Object.entries(S.cart).map(([id, qty]) => ({ id, qty, unit: S.runit[id] || (S.products.find(p => p.id === id) || {}).unit }));
        const res = await api('/api/returns', { method: 'POST', retry: 2, timeout: 120000, json: { agent: S.ret.agent, client_name: S.ret.client, items, comment: S.ret.comment, req_id: rid } });
        LS.set('rreq_id', null); S.cart = {}; S.runit = {}; saveCart(); S.ret = { agent: '', client: '', ptype: '', photos: [], comment: '' };
        buzz('heavy'); confetti(); toast(res.duplicate ? 'Avval yuborilgan edi ✅' : `✅ Vozvrat R-${res.ret.id} tasdiqqa yuborildi`); retHome();
      } catch (e) { toast(e.network ? e.message + ' — ma\'lumot saqlangan' : e.message); b.disabled = false; b.textContent = txt; }
    };
  };
  draw();
}

/* ================================================================== admin */
async function loadUsers() {
  const box = $('#usr'); if (!box) return;
  try {
    const { items, agents } = await api('/api/users');
    box.innerHTML = items.map(u => `<div class="urow" style="padding:8px 0;border-bottom:1px solid #F0F1F5"><div style="display:flex;gap:8px;align-items:center"><div style="flex:1;min-width:0"><b>${esc(u.name)}</b>${u.admin ? ' 👑' : ''}<div class="mut" style="font-size:12px">${u.username ? '@' + esc(u.username) + ' · ' : ''}${u.tg_id}</div></div>
      <select data-u="${u.tg_id}" style="max-width:48%"><option value="">🚫 Ruxsat yo'q</option><option value="@sklad" ${u.agent === '@sklad' ? 'selected' : ''}>📦 Skladchi (vozvrat)</option>${agents.map(g => `<option ${u.agent === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span class="mut" style="flex:1;font-size:13px">📱 Ilova: ${u.login ? '<b style="color:var(--txt)">' + esc(u.login) + '</b>' : 'login berilmagan'}</span><button type="button" class="btn sec small" data-lg="${u.tg_id}">🔑 ${u.login ? 'Almashtirish' : 'Login berish'}</button></div>
      <div class="lgf hidden" data-lf="${u.tg_id}" style="margin-top:6px;display:grid;gap:6px"><input placeholder="Login (lotincha, masalan samandar)" value="${esc(u.login || '')}" data-ll autocomplete="off" autocapitalize="off"><input placeholder="Parol (kamida 6 belgi)" data-lp autocomplete="new-password">
      <div style="display:flex;gap:6px"><button type="button" class="btn small" data-ls="${u.tg_id}">Saqlash</button>${u.login ? `<button type="button" class="btn sec small" data-ld="${u.tg_id}">O'chirish</button>` : ''}</div></div></div>`).join('') || '<div class="mut">Hali hech kim kirmagan</div>';
    $('#nag').innerHTML = '<option value="">Agentni tanlang</option><option value="@sklad">📦 Skladchi (vozvrat)</option>' + agents.map(g => `<option>${esc(g)}</option>`).join('');
    $('#nadd').onclick = async () => { const id = $('#nid').value.replace(/\D/g, ''), ag = $('#nag').value; if (!id || !ag) return toast('ID va agentni kiriting'); try { await api('/api/users/' + id + '/access', { method: 'PUT', json: { agent: ag } }); toast('Qo\'shildi'); loadUsers(); } catch (e) { toast(e.message); } };
    $$('[data-lg]', box).forEach(b => b.onclick = () => { const f = $(`[data-lf="${b.dataset.lg}"]`, box); f.classList.toggle('hidden'); if (!f.classList.contains('hidden')) { const p = $('[data-lp]', f); p.value = Math.random().toString(36).slice(2, 8); } });
    const saveLogin = async (id, login, password) => { try { await api('/api/users/' + id + '/login', { method: 'PUT', json: { login, password } }); toast(login ? `✅ Saqlandi. Agentga yuboring: ${login} / ${password}` : 'Login o\'chirildi'); loadUsers(); } catch (e) { toast(e.message); } };
    $$('[data-ls]', box).forEach(b => b.onclick = () => { const f = b.closest('.lgf'); saveLogin(b.dataset.ls, $('[data-ll]', f).value.trim(), $('[data-lp]', f).value); });
    $$('[data-ld]', box).forEach(b => b.onclick = () => saveLogin(b.dataset.ld, '', ''));
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
  // tepadagi "Aa" tugmasi olib tashlandi — katta yozuv faqat Profil → "Katta yozuv" da yoqiladi/o'chiriladi
  apply();
})();

/* ================================================================== profil, sozlamalar, qulf */
const SVG = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  finger: '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
};
const svg = k => `<svg viewBox="0 0 24 24">${SVG[k]}</svg>`;
const LS = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const BIO = tg && tg.BiometricManager;
let bioReady = false;
let _bioCb = null;
window.__bioResult = ok => { const c = _bioCb; _bioCb = null; c && c(!!ok); };
const NBIO = NATIVE && NATIVE.canBiometric ? {            // APK: Android BiometricPrompt
  isAccessGranted: true,
  authenticate: (o, cb) => { _bioCb = cb; try { NATIVE.biometric(o.reason || 'Kirish'); } catch (e) { window.__bioResult(false); } },
  requestAccess: (o, cb) => cb(true),
} : null;
function bioInit() { return new Promise(res => { if (NBIO) { let ok = false; try { ok = !!NATIVE.canBiometric(); } catch (e) {} return res(ok); } if (!BIO) return res(false); try { BIO.init(() => { bioReady = true; res(BIO.isBiometricAvailable); }); } catch (e) { res(false); } }); }
async function sha(s) { try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('mc:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return 'p' + s; } }
const ask = m => new Promise(res => { try { if (tg && tg.showConfirm && tg.platform !== 'unknown') return tg.showConfirm(m, ok => res(!!ok)); } catch (e) {} res(confirm(m)); });
const lockOn = () => !!(LS.get('pinh') || LS.get('bio') === '1');
const initials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'MC';

function showLock(onOpen, mode = 'unlock', mandatory = false) {          // mode: unlock | set | confirm
  const L = $('#lock'); let pin = '', first = '';
  const title = { unlock: 'Salom, ' + esc(S.me ? S.me.name : ''), set: 'Yangi PIN kod', confirm: 'PIN kodni takrorlang' };
  const sub = { unlock: LS.get("pinh") ? "Kirish kodingizni kiriting" + (LS.get('bio') === '1' ? " yoki barmoq izini qo'ying" : '') : "Barmoq izini qo'ying", set: '4 ta raqam kiriting', confirm: 'Xuddi shu 4 raqamni yana kiriting' };
  if (mandatory) { title.set = "O'zingizga 4 xonali kod qo'ying"; sub.set = 'Keyingi safar ilovaga shu kod bilan kirasiz'; }
  const draw = () => {
    const showPad = mode !== 'unlock' || LS.get('pinh');
    L.innerHTML = `<div class="lk-logo"><div class="lk-coin"><img src="/static/logo.png" alt="MeatCity"><img src="/static/logo.png" alt="" aria-hidden="true" class="bk"></div></div><div class="lk-brand">MEATCITY · XODIM</div>
      <div class="lk-hi">${title[mode]}</div><div class="lk-sub">${sub[mode]}</div>
      ${showPad ? `<div class="lk-dots">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>` : '<div style="height:40px"></div>'}
      <div class="lk-keys">${showPad ? [1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('') : ''}
        ${mode === 'unlock' && LS.get('bio') === '1' ? `<button type="button" class="lk-fp" aria-label="Barmoq izi">${svg('finger')}</button>` : '<span></span>'}
        ${showPad ? `<button type="button" data-k="0">0</button><button type="button" class="lk-del" data-k="del">O'chirish</button>` : ''}</div>
      ${mode === 'unlock' ? `<button type="button" id="lkForgot" style="margin-top:auto;border:0;background:none;color:var(--mut);font:inherit;font-size:14px">Kodni unutdingizmi?</button>` : mandatory ? '' : `<button type="button" id="lkCancel" style="margin-top:auto;border:0;background:none;color:var(--mut);font:inherit;font-size:15px;font-weight:700">Bekor qilish</button>`}`;
    $$('[data-k]', L).forEach(b => b.onclick = () => key(b.dataset.k));
    const fp = $('.lk-fp', L); if (fp) fp.onclick = bio;
    const fg = $('#lkForgot'); if (fg) fg.onclick = async () => { if (await ask("PIN va barmoq izi o'chiriladi, ilova ochiladi. Davom etasizmi?")) { LS.set('pinh', null); LS.set('bio', null); if (APP) { tokenSet(''); L.classList.add('hidden'); return loginView(); } done(); } };
    const cn = $('#lkCancel'); if (cn) cn.onclick = () => { L.classList.add('hidden'); onOpen && onOpen(false); };
  };
  const done = () => { L.classList.add('hidden'); buzz('medium'); onOpen && onOpen(true); };
  const fail = () => { pin = ''; draw(); const d = $('.lk-dots', L); d && d.classList.add('err'); try { tg && tg.HapticFeedback.notificationOccurred('error'); } catch (e) {} };
  async function key(k) {
    buzz();
    if (k === 'del') { pin = pin.slice(0, -1); return draw(); }
    if (pin.length >= 4) return; pin += k; draw();
    if (pin.length < 4) return;
    await sleep(120);
    if (mode === 'unlock') { (await sha(pin)) === LS.get('pinh') ? done() : fail(); }
    else if (mode === 'set') { first = pin; pin = ''; mode = 'confirm'; draw(); }
    else if (mode === 'confirm') { if (pin === first) { LS.set('pinh', await sha(pin)); toast("✅ PIN kod o'rnatildi"); done(); } else { mode = 'set'; first = ''; fail(); toast('PIN mos kelmadi, qaytadan'); } }
  }
  async function bio() {
    if (!(await bioInit())) return toast("Bu telefonda barmoq izi mavjud emas");
    (NBIO || BIO).authenticate({ reason: 'Online zakas ilovasiga kirish' }, ok => ok ? done() : toast('Barmoq izi tasdiqlanmadi'));
  }
  L.classList.remove('hidden'); draw();
  if (mode === 'unlock' && LS.get('bio') === '1') setTimeout(bio, 350);
}

async function profileView() {
  clearTimer(); setBack(home); updateCartBar(false); setDock('profile'); banner && banner.setProgress(null);
  const me = S.me, big = document.body.classList.contains('big');
  render(`
    <div class="card pf-head" data-a><div class="pf-ava">${esc(initials(me.name))}</div><div class="pf-name">${esc(me.name)}</div>
      <div class="mut">${me.admin ? 'Admin' : 'Savdo agenti'} · MeatCity Jizzax</div>
      <div class="pf-stats"><div><b id="pfC">…</b><small>Mijoz</small></div><div><b id="pfT">…</b><small>Bugun zakas</small></div><div><b id="pfW">…</b><small>Hafta zakas</small></div></div></div>
    <div class="sec-h" data-a>Kirish va xavfsizlik</div>
    <div class="card pf-list" data-a>
      <button type="button" class="pf-row" id="pfBio"><span class="pf-ic">${svg('finger')}</span><span class="t">Barmoq izi bilan kirish<small>Ilova ochilganda otpechatka so'raladi</small></span><span class="sw ${LS.get('bio') === '1' ? 'on' : ''}"></span></button>
      <button type="button" class="pf-row" id="pfPin"><span class="pf-ic">${svg('lock')}</span><span class="t">${APP ? 'Kirish kodini almashtirish' : 'PIN kod'}<small>${APP ? '4 xonali kod' : LS.get('pinh') ? "O'rnatilgan · bosib o'chirish" : "4 xonali zaxira kod"}</small></span>${APP ? `<span style="color:#A2A4B6;display:flex;width:18px">${svg('chev')}</span>` : `<span class="sw ${LS.get('pinh') ? 'on' : ''}"></span>`}</button>
    </div>
    <div class="sec-h" data-a>Ko'rinish</div>
    <div class="card pf-list" data-a>
      <button type="button" class="pf-row" id="pfBig"><span class="pf-ic">${svg('text')}</span><span class="t">Katta yozuv<small>Yoshi kattalar uchun qulay</small></span><span class="sw ${big ? 'on' : ''}"></span></button>
      <button type="button" class="pf-row" id="pfOrders"><span class="pf-ic">${svg('list')}</span><span class="t">Mening zakaslarim</span><span style="color:#A2A4B6;display:flex;width:18px">${svg('chev')}</span></button>
      ${me.admin ? `<button type="button" class="pf-row" id="pfAdmin"><span class="pf-ic">${svg('gear')}</span><span class="t">Admin sozlamalari</span><span style="color:#A2A4B6;display:flex;width:18px">${svg('chev')}</span></button>` : ''}
    </div>
    <button type="button" class="pf-out" id="pfOut" data-a><span style="width:20px;height:20px;display:flex">${svg('logout')}</span> Profildan chiqish</button>
    <div class="mut" style="text-align:center;font-size:12px;margin-top:8px" data-a>Telegram ID: ${me.id}</div>`);
  $$('.pf-row svg, .pf-out svg').forEach(s => { s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.style.width = s.style.height = '20px'; });
  $('#pfOrders').onclick = home;
  if ($('#pfAdmin')) $('#pfAdmin').onclick = adminView;
  $('#pfBig').onclick = () => { const on = !document.body.classList.contains('big'); document.body.classList.toggle('big', on); LS.set('big', on ? '1' : '0'); const b = $('#aa'); if (b) b.textContent = on ? 'Aa −' : 'Aa +'; buzz(); profileView(); };
  $('#pfPin').onclick = () => {
    if (APP) return showLock(() => { toast("✅ Kod almashtirildi"); profileView(); }, 'set');
    if (LS.get('pinh')) { if (LS.get('bio') === '1') return toast("Avval barmoq izini o'chiring"); LS.set('pinh', null); toast("PIN kod o'chirildi"); return profileView(); }
    showLock(() => profileView(), 'set');
  };
  $('#pfBio').onclick = async () => {
    if (LS.get('bio') === '1') { LS.set('bio', null); toast("Barmoq izi o'chirildi"); return profileView(); }
    if (!(await bioInit())) return toast("Bu telefonda barmoq izi mavjud emas yoki Telegram eski");
    const go = () => (NBIO || BIO).authenticate({ reason: 'Barmoq izini tasdiqlang' }, ok => { if (ok) { LS.set('bio', '1'); toast('✅ Barmoq izi yoqildi'); if (!LS.get('pinh')) { toast("Zaxira uchun PIN kod ham o'rnating"); return showLock(() => profileView(), 'set'); } } profileView(); });
    (NBIO || BIO).isAccessGranted ? go() : (NBIO || BIO).requestAccess({ reason: 'Online zakas ilovasiga barmoq izi bilan kirish' }, ok => ok ? go() : toast("Ruxsat berilmadi — Telegram sozlamalaridan yoqing"));
  };
  $('#pfOut').onclick = async () => {
    if (!(await ask('Profildan chiqasizmi?' + (lockOn() ? '' : "\n(Qayta kirishni himoyalash uchun PIN yoki barmoq izini yoqing)")))) return;
    if (lockOn()) { setDock(null); showLock(ok => ok && home()); }
    else if (APP) { try { await api('/api/app/logout', { method: 'POST' }); } catch (e) {} tokenSet(''); loginView(); }
    else if (tg && tg.close) tg.close(); else home();
  };
  try {
    const [{ items }, regs] = await Promise.all([api('/api/orders?scope=mine'), api('/api/regions').catch(() => ({ items: [] }))]);
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const w0 = d0.getTime() - 6 * 864e5;
    $('#pfT').textContent = items.filter(o => o.created * 1000 >= d0.getTime()).length;
    $('#pfW').textContent = items.filter(o => o.created * 1000 >= w0).length;
    $('#pfC').textContent = me.admin ? me.clients : regs.items.reduce((s, r) => s + r.count, 0);
  } catch (e) {}
}

/* ================================================================== bildirishnomalar */
const NIC = { order: 'M12 5v14M5 12h14', status: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8', printed: 'M6 9V3h12v6M3 9h18v8H3zM6 14h12v7H6z', delivered: 'm5 12 5 5 9-10', client: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0', info: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' };
function setBadge(n) { const b = $('#nbadge'); if (!b) return; b.textContent = n > 9 ? '9+' : n; b.classList.toggle('hidden', !n); }
async function pollNotes() { try { const { unread } = await api('/api/notes'); setBadge(unread); } catch (e) {} }
const ago = t => { const s = Date.now() / 1000 - t; if (s < 60) return 'hozir'; if (s < 3600) return Math.floor(s / 60) + ' daq'; const d = new Date(t * 1000), td = new Date(); return d.toDateString() === td.toDateString() ? d.toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('uz', { day: '2-digit', month: '2-digit' }); };
async function notesView() {
  clearTimer(); setBack(home); updateCartBar(false); setDock('notes'); banner && banner.setProgress(null);
  render(`<h2 class="sec-h" style="margin-top:4px" data-a>Bildirishnomalar</h2><div id="nl"><div class="sk"></div><div class="sk"></div></div>`);
  try {
    const { items } = await api('/api/notes');
    $('#nl').innerHTML = items.length ? `<div class="card nlist">` + items.map(n => `<div class="nrow ${n.read ? '' : 'unread'}" ${n.order_id ? `data-o="${n.order_id}"` : ''}>
      <span class="nic"><svg viewBox="0 0 24 24"><path d="${NIC[n.kind] || NIC.info}"/></svg></span>
      <span class="nt"><span class="nh"><b>${esc(n.title)}</b><small>${ago(n.created)}</small></span>${n.body ? `<span class="mut">${esc(n.body)}</span>` : ''}</span></div>`).join('') + `</div>`
      : `<div class="card" style="text-align:center;padding:30px 16px" data-a><b>Hozircha xabar yo'q</b><div class="mut" style="margin-top:6px">Zakas chop etilsa, yo'lga chiqsa yoki yetkazilsa shu yerda ko'rinadi.</div></div>`;
    $$('#nl .nrow[data-o]').forEach(r => r.onclick = async () => { try { const { items: os } = await api('/api/orders?scope=mine'); const o = os.find(x => x.id == r.dataset.o); o && detail(o); } catch (e) {} });
    if (items.some(n => !n.read)) { api('/api/notes/read', { method: 'POST' }).catch(() => {}); setBadge(0); }
  } catch (e) { $('#nl').innerHTML = `<div class="mut">${esc(e.message)}</div>`; }
}
setInterval(() => { if (S.me && S.me.allowed && !document.hidden) pollNotes(); }, 30000);

/* ================================================================== APK: bot kodi bilan kirish */
function loginView() {
  setDock(null); updateCartBar(false); setBack(null);
  const L = $('#lock');
  L.innerHTML = `<div class="lk-logo"><div class="lk-coin"><img src="/static/logo.png" alt="MeatCity"><img src="/static/logo.png" alt="" aria-hidden="true" class="bk"></div></div><div class="lk-brand">MEATCITY · XODIM</div>
    <div class="lk-hi">Ilovaga kirish</div><div class="lk-sub">Admin bergan login va parolni kiriting</div>
    <form id="lgForm" style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px;margin-top:18px">
      <label class="mut" style="font-size:13px;font-weight:700">Login<input id="lgL" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" style="margin-top:4px;width:100%;box-sizing:border-box;height:52px;padding:0 14px;font-size:17px"></label>
      <label class="mut" style="font-size:13px;font-weight:700">Parol<input id="lgP" type="password" autocomplete="current-password" style="margin-top:4px;width:100%;box-sizing:border-box;height:52px;padding:0 14px;font-size:17px"></label>
      <button class="btn" type="submit" id="lgB" style="margin-top:6px">Kirish</button>
      <div class="lk-sub" id="lgMsg" style="min-height:20px"></div>
    </form>
    <div class="lk-sub" style="margin-top:auto;font-size:13px">Login yo'qmi? Adminga murojaat qiling</div>`;
  L.classList.remove('hidden');
  $('#lgForm').onsubmit = async e => {
    e.preventDefault();
    const login = $('#lgL').value.trim(), password = $('#lgP').value;
    if (!login || !password) return $('#lgMsg').textContent = 'Login va parolni kiriting';
    $('#lgB').disabled = true; $('#lgMsg').textContent = 'Tekshirilmoqda…';
    try {
      const r = await fetch('/app/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password, device: navigator.userAgent.slice(0, 80) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Xato');
      tokenSet(d.token); LS.set('pinh', null); LS.set('bio', null);
      firstSetup();
    } catch (er) { $('#lgMsg').textContent = '❌ ' + er.message; $('#lgB').disabled = false; }
  };
}
function firstSetup() {                          // birinchi kirish: o'z kodini qo'yadi, keyin barmoq izi (bo'lsa)
  showLock(async () => {
    if (await bioInit()) {
      if (await ask("Barmoq izi bilan kirishni yoqasizmi?\nKeyingi safar kod o'rniga otpechatka qo'yasiz.")) {
        const B = NBIO || BIO;
        const go = () => B.authenticate({ reason: 'Barmoq izini tasdiqlang' }, ok => { if (ok) { LS.set('bio', '1'); toast('✅ Barmoq izi yoqildi'); } unlocked = true; start(); });
        return B.isAccessGranted ? go() : B.requestAccess({ reason: 'Online zakas ilovasiga barmoq izi bilan kirish' }, ok => { if (ok) return go(); unlocked = true; start(); });
      }
    }
    unlocked = true; start();
  }, 'set', true);
}

/* ================================================================== start */
let unlocked = false;
async function start() {
  if (APP && !tokenGet()) return loginView();
  if (APP && !LS.get('pinh')) return firstSetup();
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
    if (S.me.role !== 'sklad') api('/api/products').then(r => { S.products = r.items; banner && banner.refresh(); }).catch(() => {});
    if (S.me.role === 'sklad') { useMode('ret'); const d = $('#dock [data-d="new"] span'); if (d) d.textContent = 'Vozvrat'; const h = $('#dock [data-d="home"] span'); if (h) h.textContent = 'Ro\'yxat'; $('#hello').textContent = '📦 Sklad · ' + S.me.name; }
    if (lockOn() && !unlocked) showLock(ok => { if (ok) { unlocked = true; home(); } }); else home();
    pollNotes();
  } catch (e) {
    render(`<div class="card" data-a>Kirish xatosi: ${esc(e.message)}<div class="mut" style="margin-top:6px">Ilovani Telegram ichidan oching.</div></div>`);
  }
}
start();
