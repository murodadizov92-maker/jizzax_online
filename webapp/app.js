/* MeatCity Jizzax — Online zakas Mini App */
const tg = window.Telegram && Telegram.WebApp;
if (tg) { tg.ready(); tg.expand(); try { tg.setHeaderColor('#0f0a1e'); tg.setBackgroundColor('#0f0a1e'); } catch (e) {} }
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = v => Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ');
const DEV = new URLSearchParams(location.search).get('dev');
const ST = { new: ['🆕 Qabul qilindi', .08], collecting: ['📦 Yig\'ilmoqda', .35], on_way: ['🚚 Yo\'lda', .68], delivered: ['✅ Yetkazildi', 1] };

async function api(path, opts = {}) {
  const headers = { 'X-Init-Data': tg ? tg.initData : '', ...(opts.headers || {}) };
  if (DEV) headers['X-Dev-User'] = DEV;
  if (opts.json) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.json); }
  const r = await fetch(path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Xato ' + r.status));
  return data;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2200); }

/* ------------------------------------------------------------------ 3D */
function logoTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#c4121f'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#fff'; g.font = 'italic 700 150px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('mc', 128, 138);
  return new THREE.CanvasTexture(c);
}
function createScene(canvas, intro) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x0f0a1e, 9, 28);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
  scene.add(new THREE.AmbientLight(0xffffff, .75));
  const dl = new THREE.DirectionalLight(0xffffff, .9); dl.position.set(4, 8, 6); scene.add(dl);
  const M = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const box = (w, h, d, c, x, y, z, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); parent.add(m); return m; };

  // yer va yo'l
  box(60, .1, 30, 0x1a1235, 0, -.06, -4);
  box(60, .06, 2.8, 0x2b2b3a, 0, 0, 0);
  for (let x = -14; x <= 14; x += 2) box(.9, .02, .12, 0xf5e6a8, x, .04, 0);

  // truck
  const truck = new THREE.Group(); scene.add(truck);
  const logo = logoTexture();
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
    const sp = new THREE.Mesh(new THREE.BoxGeometry(.5, .28, .09), M(0xdddddd)); w.add(sp);
  }
  truck.position.set(-4, 0, 0);

  let disc = null;
  if (intro) {
    disc = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, .35, 48), [M(0x7a0c15), new THREE.MeshBasicMaterial({ map: logo }), new THREE.MeshBasicMaterial({ map: logo })]);
    disc.rotation.x = Math.PI / 2; disc.position.set(0, 2.9, 0); scene.add(disc);
    cam.position.set(0, 2.6, 8.2); cam.lookAt(0, 1.7, 0);
  } else {
    // ombor (chapda) va mijoz do'koni (o'ngda)
    box(2.6, 1.8, 1.8, 0x3a2a66, -6, .9, -2.4); box(2.8, .25, 2, 0xc4121f, -6, 1.9, -2.4);
    box(2.2, 1.4, 1.6, 0x2b4a7a, 6, .7, -2.4); box(2.4, .22, 1.8, 0x8b5cf6, 6, 1.5, -2.4);
    box(.06, 1.2, .06, 0xdddddd, 6.9, 2.1, -2.4); box(.5, .3, .04, 0xe11d2e, 7.15, 2.55, -2.4);
    for (let i = 0; i < 16; i++) {  // fon binolari
      const x = -14 + i * 1.9 + Math.random(), h = 1 + Math.random() * 3;
      box(1.4, h, 1.2, [0x241a45, 0x2d2155, 0x1d1538][i % 3], x, h / 2, -5.2 - Math.random() * 2);
    }
    cam.position.set(0, 2.5, 8.5); cam.lookAt(0, .9, 0);
  }

  let target = null, x = -4, last = performance.now(), running = true;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  (function loop(t) {
    if (!running) return; requestAnimationFrame(loop);
    const dt = Math.min((t - last) / 1000, .05); last = t;
    if (target == null) { x += dt * 1.6; if (x > 6.5) x = -6.5; }
    else x += (target - x) * Math.min(1, dt * 1.8);
    const moving = target == null || Math.abs(target - x) > .05;
    truck.position.x = x;
    if (moving) wheels.forEach(w => w.rotation.y -= dt * 8 * (target == null || target > x ? 1 : -1));
    truck.position.y = moving ? Math.sin(t / 90) * .015 : 0;
    if (disc) disc.rotation.y += dt * 1.4;
    renderer.render(scene, cam);
  })(performance.now());
  return {
    setProgress(p) { target = p == null ? null : -4.4 + p * 8.8; },
    stop() { running = false; removeEventListener('resize', resize); renderer.dispose(); }
  };
}
let banner = null, introScene = null;
try {
  introScene = createScene($('#introCanvas'), true);
  banner = createScene($('#bannerCanvas'), false);
} catch (e) { $('#intro').classList.add('out'); }
setTimeout(() => { $('#intro').classList.add('out'); setTimeout(() => introScene && introScene.stop(), 900); }, 2600);

/* ------------------------------------------------------------------ holat */
const S = { me: null, products: [], cat: 'Hammasi', q: '', cart: JSON.parse(localStorage.getItem('cart') || '{}'), client: null, region: '', tab: 'all', timer: null };
const saveCart = () => localStorage.setItem('cart', JSON.stringify(S.cart));
const view = $('#view');
let backFn = null;
function setBack(fn) {
  backFn = fn;
  if (!tg) return;
  tg.BackButton.offClick(onBack); if (fn) { tg.BackButton.show(); tg.BackButton.onClick(onBack); } else tg.BackButton.hide();
}
function onBack() { backFn && backFn(); }
const cartSum = () => Object.entries(S.cart).reduce((s, [id, q]) => { const p = S.products.find(p => p.id === id); return s + (p ? p.price * q : 0); }, 0);
const cartCount = () => Object.keys(S.cart).length;
function updateCartBar(show) {
  const bar = $('#cartbar'); const n = cartCount();
  bar.classList.toggle('hidden', !(show && n));
  $('#cartBtn').textContent = `🛒 Savat: ${n} ta · ${money(cartSum())} so'm →`;
}
function clearTimer() { clearInterval(S.timer); S.timer = null; }

/* ------------------------------------------------------------------ bosh sahifa: zakaslar */
async function home() {
  clearTimer(); setBack(null); updateCartBar(false); banner && banner.setProgress(null);
  view.innerHTML = `
    <button class="btn" id="newOrd">➕ Yangi zakas</button>
    <div style="height:12px"></div>
    <div class="tabs"><div class="tab ${S.tab === 'all' ? 'on' : ''}" data-t="all">Hamma zakaslar</div><div class="tab ${S.tab === 'mine' ? 'on' : ''}" data-t="mine">Mening zakaslarim</div></div>
    <div id="list"><div class="mut">Yuklanmoqda…</div></div>
    ${S.me.admin ? '<button class="btn sec small" id="adm" style="margin-top:14px">⚙️ Admin</button>' : ''}`;
  $('#newOrd').onclick = newOrder;
  view.querySelectorAll('.tab').forEach(t => t.onclick = () => { S.tab = t.dataset.t; home(); });
  if ($('#adm')) $('#adm').onclick = adminView;
  const load = async () => {
    try {
      const { items } = await api('/api/orders?scope=' + S.tab);
      $('#list').innerHTML = items.length ? items.map(o => `
        <div class="card" data-id="${o.id}">
          <div class="row"><b>#${o.id} · ${esc(o.client_name)}</b><span class="badge s-${o.status}">${ST[o.status][0]}</span></div>
          <div class="mut">${esc(o.region || '')} · ${esc(o.user_name)} · ${new Date(o.created * 1000).toLocaleString('uz', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          <div class="row" style="margin-top:6px"><span class="mut">${o.items.length} ta mahsulot</span><b>${money(o.total)} so'm</b></div>
        </div>`).join('') : '<div class="mut">Hozircha zakas yo\'q</div>';
      view.querySelectorAll('.card[data-id]').forEach(c => c.onclick = () => detail(items.find(o => o.id == c.dataset.id)));
    } catch (e) { $('#list').innerHTML = `<div class="mut">${esc(e.message)}</div>`; }
  };
  await load(); S.timer = setInterval(load, 20000);
}

function detail(o) {
  clearTimer(); setBack(home); updateCartBar(false);
  banner && banner.setProgress(ST[o.status][1]);
  const keys = Object.keys(ST);
  view.innerHTML = `
    <h2>Zakas #${o.id}</h2>
    <div class="card"><b>${esc(o.client_name)}</b><div class="mut">${esc(o.region || '')}</div>
      <div class="steps">${keys.map(k => `<span class="${keys.indexOf(k) <= keys.indexOf(o.status) ? 'on' : ''}">${ST[k][0]}</span>`).join('')}</div></div>
    <div class="card">${o.items.map(i => `<div class="row" style="margin:5px 0"><span>${esc(i.name)} × ${i.qty}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
      <hr style="border-color:var(--line)"><div class="row"><span>Jami</span><span class="sum">${money(o.total)} so'm</span></div></div>
    ${o.comment ? `<div class="card mut">💬 ${esc(o.comment)}</div>` : ''}
    ${S.me.admin ? `<div class="card"><div class="mut" style="margin-bottom:8px">Holatni o'zgartirish (admin)</div>
      <div class="chips" style="flex-wrap:wrap">${keys.map(k => `<div class="chip ${k === o.status ? 'on' : ''}" data-s="${k}">${ST[k][0]}</div>`).join('')}</div>
      <button class="btn sec small" id="del" style="margin-top:8px">🗑 O'chirish</button></div>` : ''}`;
  view.querySelectorAll('[data-s]').forEach(c => c.onclick = async () => {
    await api(`/api/orders/${o.id}/status`, { method: 'POST', json: { status: c.dataset.s } });
    o.status = c.dataset.s; toast('Holat yangilandi'); detail(o);
  });
  if ($('#del')) $('#del').onclick = async () => { if (confirm('Zakasni o\'chirasizmi?')) { await api('/api/orders/' + o.id, { method: 'DELETE' }); home(); } };
}

/* ------------------------------------------------------------------ yangi zakas: 1) mijoz */
async function newOrder() {
  clearTimer(); setBack(home); updateCartBar(false); banner && banner.setProgress(null);
  S.region = S.me.region || ''; let regions = [];
  try { regions = (await api('/api/regions')).items; } catch (e) {}
  view.innerHTML = `
    <div class="steps"><span class="on">1. Mijoz</span><span>2. Mahsulot</span><span>3. Tasdiq</span></div>
    <input id="q" placeholder="🔍 Mijoz nomi yoki telefon…" autocomplete="off">
    <div class="chips" id="regs"></div><div id="res"></div>`;
  const drawRegs = () => {
    $('#regs').innerHTML = `<div class="chip ${S.region ? '' : 'on'}" data-r="">Hammasi</div>` + regions.map(r => `<div class="chip ${S.region === r.region ? 'on' : ''}" data-r="${esc(r.region)}">${esc(r.region)} (${r.count})</div>`).join('');
    $('#regs').querySelectorAll('.chip').forEach(c => c.onclick = () => {
      S.region = c.dataset.r; drawRegs(); search();
      api('/api/me', { method: 'PUT', json: { region: S.region } }).then(() => S.me.region = S.region).catch(() => {});
    });
  };
  let tm;
  const search = async () => {
    const { items } = await api(`/api/clients?q=${encodeURIComponent($('#q').value)}&region=${encodeURIComponent(S.region)}`);
    $('#res').innerHTML = items.length ? items.map(c => `<div class="client" data-id="${c.id}"><b>${esc(c.name)}</b><div class="mut">${esc(c.region)} ${esc(c.address)} ${esc(c.phone)}</div></div>`).join('') : '<div class="mut" style="margin-top:12px">Mijoz topilmadi</div>';
    $('#res').querySelectorAll('.client').forEach(el => el.onclick = () => { S.client = items.find(c => c.id == el.dataset.id); pickProducts(); });
  };
  $('#q').oninput = () => { clearTimeout(tm); tm = setTimeout(search, 200); };
  drawRegs(); search();
}

/* ------------------------------------------------------------------ 2) mahsulotlar */
async function pickProducts() {
  setBack(newOrder);
  if (!S.products.length) {
    view.innerHTML = '<div class="mut">Mahsulotlar yuklanmoqda…</div>';
    try { S.products = (await api('/api/products')).items; } catch (e) { toast(e.message); return; }
  } else api('/api/products').then(r => { S.products = r.items; }).catch(() => {});
  const cats = ['Hammasi', ...new Set(S.products.map(p => p.category))];
  view.innerHTML = `
    <div class="steps"><span>1. Mijoz</span><span class="on">2. Mahsulot</span><span>3. Tasdiq</span></div>
    <div class="card" style="margin-top:0"><b>${esc(S.client.name)}</b> <span class="mut">${esc(S.client.region)}</span></div>
    <input id="pq" placeholder="🔍 Mahsulot qidirish…" value="${esc(S.q)}">
    <div class="chips" id="cats">${cats.map(c => `<div class="chip ${c === S.cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</div>`).join('')}</div>
    <div class="grid" id="grid"></div>`;
  const draw = () => {
    const q = S.q.toLowerCase();
    // qidiruv faqat tanlangan kategoriya ichidan
    const list = S.products.filter(p => (S.cat === 'Hammasi' || p.category === S.cat) && (!q || p.name.toLowerCase().includes(q)));
    $('#grid').innerHTML = list.map(p => `
      <div class="prod" data-id="${p.id}">
        <div class="im" style="${p.image ? `background-image:url('${esc(p.image)}')` : ''}">${p.image ? '' : '🥩'}</div>
        <div class="in"><div class="nm">${esc(p.name)}</div><div class="pr">${money(p.price)} so'm${p.unit ? ' / ' + esc(p.unit) : ''}</div>
          <div class="qty"><button data-d="-1">−</button><input type="number" inputmode="decimal" min="0" step="any" value="${S.cart[p.id] || ''}" placeholder="0"><button data-d="1">+</button></div>
          <button class="add" style="margin-top:7px">Savatga</button></div>
      </div>`).join('') || '<div class="mut">Hech narsa topilmadi</div>';
    $('#grid').querySelectorAll('.prod').forEach(card => {
      const id = card.dataset.id, inp = $('input', card);
      const set = v => { v = Math.max(0, +v || 0); if (v) S.cart[id] = v; else delete S.cart[id]; inp.value = v || ''; saveCart(); updateCartBar(true); };
      card.querySelectorAll('[data-d]').forEach(b => b.onclick = () => set((+inp.value || 0) + +b.dataset.d));
      inp.onchange = () => set(inp.value);
      $('.add', card).onclick = () => { if (!+inp.value) set(1); fly($('.im', card)); };
      // 3D tilt
      card.addEventListener('pointermove', e => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; card.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 14}deg) translateZ(6px)`; });
      ['pointerleave', 'pointerup', 'pointercancel'].forEach(ev => card.addEventListener(ev, () => card.style.transform = ''));
    });
  };
  $('#cats').querySelectorAll('.chip').forEach(c => c.onclick = () => { S.cat = c.dataset.c; $('#cats').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); draw(); });
  $('#pq').oninput = e => { S.q = e.target.value; draw(); };
  $('#cartBtn').onclick = confirmView;
  draw(); updateCartBar(true);
}
function fly(src) {
  const a = src.getBoundingClientRect(), b = $('#cartBtn').getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'fly'; el.style.backgroundImage = src.style.backgroundImage; document.body.appendChild(el);
  el.animate([{ left: a.left + a.width / 2 - 27 + 'px', top: a.top + 'px', transform: 'scale(1)', opacity: 1 },
    { left: b.left + b.width / 2 - 27 + 'px', top: b.top + 'px', transform: 'scale(.3) rotate(200deg)', opacity: .2 }], { duration: 650, easing: 'cubic-bezier(.5,-.3,.8,.4)' }).onfinish = () => el.remove();
}

/* ------------------------------------------------------------------ 3) tasdiq */
function confirmView() {
  setBack(pickProducts); updateCartBar(false);
  const draw = () => {
    const rows = Object.entries(S.cart).map(([id, q]) => ({ p: S.products.find(p => p.id === id), id, q })).filter(r => r.p);
    view.innerHTML = `
      <div class="steps"><span>1. Mijoz</span><span>2. Mahsulot</span><span class="on">3. Tasdiq</span></div>
      <div class="card"><b>${esc(S.client.name)}</b><div class="mut">${esc(S.client.region)}</div></div>
      ${rows.map(r => `<div class="card"><div class="row"><b>${esc(r.p.name)}</b><button class="back" data-rm="${r.id}">✕</button></div>
        <div class="row"><span class="mut">${money(r.p.price)} × </span><div class="qty" style="width:150px"><button data-m="${r.id}">−</button><input type="number" step="any" value="${r.q}" data-i="${r.id}"><button data-p="${r.id}">+</button></div><b>${money(r.p.price * r.q)}</b></div></div>`).join('') || '<div class="mut">Savat bo\'sh</div>'}
      <textarea id="cm" rows="2" placeholder="💬 Izoh (ixtiyoriy)"></textarea>
      <div class="row" style="margin:12px 0"><span>Jami</span><span class="sum">${money(cartSum())} so'm</span></div>
      <button class="btn" id="send" ${rows.length ? '' : 'disabled'}>✅ Zakasni yuborish</button>`;
    const chg = (id, v) => { v = Math.max(0, +v || 0); if (v) S.cart[id] = v; else delete S.cart[id]; saveCart(); draw(); };
    view.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => chg(b.dataset.rm, 0));
    view.querySelectorAll('[data-m]').forEach(b => b.onclick = () => chg(b.dataset.m, S.cart[b.dataset.m] - 1));
    view.querySelectorAll('[data-p]').forEach(b => b.onclick = () => chg(b.dataset.p, S.cart[b.dataset.p] + 1));
    view.querySelectorAll('[data-i]').forEach(i => i.onchange = () => chg(i.dataset.i, i.value));
    $('#send').onclick = async () => {
      $('#send').disabled = true;
      try {
        const items = Object.entries(S.cart).map(([id, qty]) => ({ id, qty }));
        const { order } = await api('/api/orders', { method: 'POST', json: { client_id: S.client.id, items, comment: $('#cm').value } });
        S.cart = {}; saveCart(); S.client = null; toast('Zakas yuborildi ✅');
        S.tab = 'mine'; detail(order); banner && banner.setProgress(ST.new[1]);
      } catch (e) { toast(e.message); $('#send').disabled = false; }
    };
  };
  draw();
}

/* ------------------------------------------------------------------ admin */
function adminView() {
  clearTimer(); setBack(home); updateCartBar(false);
  view.innerHTML = `
    <h2>⚙️ Admin</h2>
    <div class="card"><b>Mijozlar bazasi</b><div class="mut">Hozir: ${S.me.clients} ta. Excel ustunlari: Клиент/Nom, Телефон, Район/Shahar, Адрес</div>
      <input type="file" id="xl" accept=".xlsx" style="margin-top:8px"><button class="btn sec small" id="up" style="margin-top:8px">📥 Excel yuklash</button></div>
    <div class="card"><b>Mijoz qo'shish</b>
      <input id="n" placeholder="Nomi" style="margin-top:8px"><input id="ph" placeholder="Telefon" style="margin-top:6px"><input id="rg" placeholder="Hudud (masalan Paxtakor shahar)" style="margin-top:6px"><input id="ad" placeholder="Manzil" style="margin-top:6px">
      <button class="btn sec small" id="addc" style="margin-top:8px">➕ Qo'shish</button></div>
    <div class="card"><b>Mahsulotlarni yangilash</b><div class="mut">Narx/rasm zakas bot'dan avtomatik olinadi (har ~45 soniyada).</div><button class="btn sec small" id="sync" style="margin-top:8px">🔄 Hozir yangilash</button></div>`;
  $('#up').onclick = async () => {
    const f = $('#xl').files[0]; if (!f) return toast('Fayl tanlang');
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api('/api/clients/import', { method: 'POST', body: fd }); toast(`${r.rows} ta mijoz yuklandi`); S.me = await api('/api/me'); adminView(); } catch (e) { toast(e.message); }
  };
  $('#addc').onclick = async () => {
    try { await api('/api/clients', { method: 'POST', json: { name: $('#n').value, phone: $('#ph').value, region: $('#rg').value, address: $('#ad').value } }); toast('Qo\'shildi'); S.me = await api('/api/me'); adminView(); } catch (e) { toast(e.message); }
  };
  $('#sync').onclick = async () => { try { S.products = (await api('/api/products?force=1')).items; toast(`${S.products.length} ta mahsulot`); } catch (e) { toast(e.message); } };
}

/* ------------------------------------------------------------------ start */
(async () => {
  try {
    S.me = await api('/api/me');
    $('#hello').textContent = 'Salom, ' + S.me.name;
    home();
  } catch (e) {
    view.innerHTML = `<div class="card">Kirish xatosi: ${esc(e.message)}<div class="mut" style="margin-top:6px">Ilovani Telegram ichidan oching.</div></div>`;
  }
})();
