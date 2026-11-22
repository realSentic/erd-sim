import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@11.18.2/+esm";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const W = 220, H0 = 34, R = 24, DEPTH = 8;
const DOM = {
  catalog: { label: "Catalog", color: "#a78bfa" },
  procurement: { label: "Procurement", color: "#fbbf24" },
  sales: { label: "Sales", color: "#34d399" },
  people: { label: "People", color: "#38bdf8" },
};

// column syntax: "name", "name pk", "name fk parent_table"
const T = {
  brands: { d: "catalog", x: 30, y: 30, c: ["brand_id pk", "brand_name", "brand_country", "brand_website"] },
  categories: { d: "catalog", x: 30, y: 200, c: ["category_id pk", "category_parent_id fk categories", "category_name", "category_description"] },
  suppliers: { d: "procurement", x: 30, y: 420, c: ["supplier_id pk", "supplier_name", "supplier_phone", "supplier_email", "supplier_address"] },
  purchase_orders: { d: "procurement", x: 30, y: 640, c: ["purchase_id pk", "supplier_id fk suppliers", "purchase_date", "purchase_status", "purchase_cost"] },
  purchase_order_items: { d: "procurement", x: 30, y: 870, c: ["po_item_id pk", "purchase_id fk purchase_orders", "product_id fk products", "quantity", "unit_cost"] },
  products: { d: "catalog", x: 340, y: 120, c: ["product_id pk", "product_sku", "product_name", "product_description", "category_id fk categories", "brand_id fk brands", "supplier_id fk suppliers", "unit_price", "cost_price"] },
  product_specs: { d: "catalog", x: 340, y: 430, c: ["spec_id pk", "product_id fk products", "spec_name", "spec_value"] },
  inventory: { d: "procurement", x: 340, y: 610, c: ["inventory_id pk", "product_id fk products", "quantity_on_hand", "reorder_level", "last_updated"] },
  order_items: { d: "sales", x: 650, y: 120, c: ["order_item_id pk", "order_id fk orders", "product_id fk products", "quantity", "unit_price"] },
  orders: { d: "sales", x: 650, y: 330, c: ["order_id pk", "customer_id fk customers", "employee_id fk employees", "shipping_address_id fk addresses", "order_date", "order_status", "order_total"] },
  payments: { d: "sales", x: 650, y: 640, c: ["payment_id pk", "order_id fk orders", "payment_method", "payment_amount", "payment_date", "payment_status"] },
  shipments: { d: "sales", x: 650, y: 840, c: ["shipment_id pk", "order_id fk orders", "courier", "tracking_number", "shipped_date", "delivered_date"] },
  customers: { d: "people", x: 980, y: 120, c: ["customer_id pk", "customer_first_name", "customer_last_name", "customer_email", "customer_phone", "created_at"] },
  addresses: { d: "people", x: 980, y: 340, c: ["address_id pk", "customer_id fk customers", "street", "city", "province", "postal_code", "address_type"] },
  employees: { d: "people", x: 980, y: 590, c: ["employee_id pk", "employee_first_name", "employee_last_name", "job_id fk jobs", "employee_email", "hire_date"] },
  jobs: { d: "people", x: 980, y: 800, c: ["job_id pk", "job_name"] },
};

// Each business domain lives on its own depth layer. This is what turns the flat ERD into a 3D scene.
const LAYER = { catalog: 0, procurement: -300, sales: 200, people: -60 };

const $ = (s) => document.querySelector(s);
const S = { sel: null, sim: null, hidden: new Set() };
const edges = [];
let Z = 1, auto = true, erdFS = false, fitDist = 2000, rm = 0, edgeEnter = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

for (const [n, t] of Object.entries(T)) {
  t.cols = t.c.map((s) => { const [name, k, ref] = s.split(" "); return { name, k, ref }; });
  t.cols.forEach((c, i) => {
    if (c.k === "fk") edges.push({ id: `${n}.${c.name}`, child: n, col: c.name, ci: i, parent: c.ref, pi: T[c.ref] ? 0 : 0 });
  });
}
const pkIndex = (n) => Math.max(0, T[n].cols.findIndex((c) => c.k === "pk"));
edges.forEach((e) => (e.pi = pkIndex(e.parent)));

// ---------- 3D layout: world position of every table ----------
const tl = Object.values(T);
for (const t of tl) t.h = H0 + t.cols.length * R;
const cx0 = (Math.min(...tl.map((t) => t.x)) + Math.max(...tl.map((t) => t.x + W))) / 2;
const cy0 = (Math.min(...tl.map((t) => t.y)) + Math.max(...tl.map((t) => t.y + t.h))) / 2;
const seen = {};
for (const t of tl) {
  const k = (seen[t.d] = (seen[t.d] ?? -1) + 1);
  t.p = new THREE.Vector3(t.x + W / 2 - cx0, -(t.y + t.h / 2 - cy0), LAYER[t.d] + ((k % 3) - 1) * 35);
  Object.assign(t, { enter: 0, cur: 1, tgt: 1, hcur: 0, htgt: 0, pulse: 1, eff: 0 });
}
const floorY = Math.min(...tl.map((t) => t.p.y - t.h / 2)) - 150;

// ---------- renderer, camera, controls ----------
const vp = $("#viewport");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const cv = renderer.domElement;
cv.style.display = "block";
vp.append(cv);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x020617, 2600, 6000);
const camera = new THREE.PerspectiveCamera(38, 1, 10, 12000);
camera.position.set(0, 0, 2000);
const controls = new OrbitControls(camera, cv);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.08, screenSpacePanning: true,
  minDistance: 200, maxDistance: 6000,
  minAzimuthAngle: -1.3, maxAzimuthAngle: 1.3,   // cards are one-sided, so don't orbit behind them
  minPolarAngle: 0.35, maxPolarAngle: 1.75,
});
const DIR = new THREE.Vector3(0.42, 0.26, 1).normalize();   // default 3/4 viewing direction

// ---------- floor, domain plates, dust ----------
const grid = new THREE.GridHelper(5000, 100, 0x1e3a5f, 0x16233a);
grid.position.y = floorY;
grid.material.transparent = true; grid.material.opacity = 0.6;
scene.add(grid);

const plates = {};
for (const [k, v] of Object.entries(DOM)) {
  const ts = tl.filter((t) => t.d === k);
  const x0 = Math.min(...ts.map((t) => t.p.x - W / 2)) - 40, x1 = Math.max(...ts.map((t) => t.p.x + W / 2)) + 40;
  const z0 = Math.min(...ts.map((t) => t.p.z)) - 90, z1 = Math.max(...ts.map((t) => t.p.z)) + 90;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, z1 - z0),
    new THREE.MeshBasicMaterial({ color: v.color, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set((x0 + x1) / 2, floorY + 1, (z0 + z1) / 2);
  scene.add(plate);
  plates[k] = plate;
}

const dust = new Float32Array(600 * 3);
for (let i = 0; i < dust.length; i += 3) {
  dust[i] = (Math.random() - 0.5) * 3600; dust[i + 1] = floorY + Math.random() * 2200; dust[i + 2] = (Math.random() - 0.5) * 2400;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dust, 3));
scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0x64748b, size: 3, transparent: true, opacity: 0.45, depthWrite: false })));

// ---------- textures ----------
const SANS = 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Consolas, Menlo, monospace';
const aniso = renderer.capabilities.getMaxAnisotropy();
function tex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}
function cardTexture(n, t) {
  const col = DOM[t.d].color, k = 3;
  const c = document.createElement("canvas");
  c.width = W * k; c.height = t.h * k;
  const g = c.getContext("2d");
  g.scale(k, k);
  g.fillStyle = "#0f172a"; g.fillRect(0, 0, W, t.h);
  g.fillStyle = col + "22"; g.fillRect(0, 0, W, H0);
  g.textBaseline = "middle";
  g.fillStyle = col; g.beginPath(); g.arc(16, H0 / 2, 4, 0, Math.PI * 2); g.fill();
  g.font = `600 14px ${SANS}`; g.fillText(n, 28, H0 / 2 + 1);
  t.cols.forEach((col2, i) => {
    const y = H0 + i * R + R / 2;
    g.font = `12px ${MONO}`; g.fillStyle = col2.k === "pk" ? "#fef3c7" : "#cbd5e1";
    g.fillText(col2.name, 12, y + 1);
    if (col2.k) {
      const pk = col2.k === "pk", bw = 22, bx = W - 12 - bw;
      g.fillStyle = pk ? "rgba(251,191,36,.2)" : "rgba(34,211,238,.2)";
      g.beginPath(); g.roundRect(bx, y - 7, bw, 14, 3); g.fill();
      g.font = `700 10px ${SANS}`; g.fillStyle = pk ? "#fcd34d" : "#67e8f9"; g.textAlign = "center";
      g.fillText(pk ? "PK" : "FK", bx + bw / 2, y + 1); g.textAlign = "left";
    }
  });
  g.strokeStyle = col + "88"; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, t.h - 2);
  return tex(c);
}
function haloTexture(t) {
  const col = DOM[t.d].color, P = 30, k = 2;
  const c = document.createElement("canvas");
  c.width = (W + P * 2) * k; c.height = (t.h + P * 2) * k;
  const g = c.getContext("2d");
  g.shadowColor = col; g.shadowBlur = 40; g.fillStyle = col;
  g.fillRect(P * k, P * k, W * k, t.h * k);
  g.shadowBlur = 0; g.strokeStyle = col; g.lineWidth = 6;
  g.strokeRect(P * k, P * k, W * k, t.h * k);
  return tex(c);
}
function textTex(txt) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.font = `700 40px ${SANS}`; g.fillStyle = "#94a3b8"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(txt, 32, 34);
  return tex(c);
}
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.5)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c);
}

// ---------- cards (thin 3D slabs with the table drawn on the front) ----------
for (const [n, t] of Object.entries(T)) {
  const col = DOM[t.d].color;
  const side = new THREE.Color(col).multiplyScalar(0.3);
  const mk = (o) => new THREE.MeshBasicMaterial({ transparent: true, ...o });
  t.mats = [mk({ color: side }), mk({ color: side }), mk({ color: side }), mk({ color: side }), mk({ map: cardTexture(n, t) }), mk({ color: 0x0b1220 })];
  t.mesh = new THREE.Mesh(new THREE.BoxGeometry(W, t.h, DEPTH), t.mats);
  t.mesh.userData.n = n;
  t.halo = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 60, t.h + 60),
    new THREE.MeshBasicMaterial({ map: haloTexture(t), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  t.halo.position.z = -DEPTH / 2 - 1;
  t.mesh.add(t.halo);
  // thin line from each card down to the floor, so depth is easy to read
  t.drop = new THREE.Line(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.28 }),
  );
  t.drop.frustumCulled = false;
  scene.add(t.mesh, t.drop);
  syncCard(t);
}
function syncCard(t) {
  t.mesh.position.copy(t.p);
  const a = t.drop.geometry.attributes.position;
  a.setXYZ(0, t.p.x, t.p.y - t.h / 2, t.p.z);
  a.setXYZ(1, t.p.x, floorY, t.p.z);
  a.needsUpdate = true;
}
const meshes = tl.map((t) => t.mesh);

// ---------- edges (3D tubes) ----------
const texN = textTex("N"), tex1 = textTex("1");
const mkLabel = (map) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  s.scale.set(22, 22, 1);
  return s;
};
for (const e of edges) {
  e.mat = new THREE.MeshBasicMaterial({ color: 0x475569, transparent: true });
  e.mesh = new THREE.Mesh(new THREE.BufferGeometry(), e.mat);
  e.a = mkLabel(texN); e.b = mkLabel(tex1);
  Object.assign(e, { on: false, cur: 0.9, tgt: 0.9, lcur: 1, ltgt: 1 });
  scene.add(e.mesh, e.a, e.b);
}
function place(e) {
  const C = T[e.child], P = T[e.parent];
  const row = (t, i) => t.p.y + t.h / 2 - H0 - i * R - R / 2;
  const cy = row(C, e.ci), py = row(P, e.pi), dx = C.p.x - P.p.x;
  let cx, px, cd, pd;
  if (dx > 4) { cx = C.p.x - W / 2; cd = -1; px = P.p.x + W / 2; pd = 1; }
  else if (dx < -4) { cx = C.p.x + W / 2; cd = 1; px = P.p.x - W / 2; pd = -1; }
  else { cx = C.p.x + W / 2; cd = 1; px = P.p.x + W / 2; pd = 1; }
  const same = Math.abs(dx) <= 4;
  const k = same ? 70 : Math.max(50, Math.hypot(cx - px, C.p.z - P.p.z) / 2);
  e.curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(cx, cy, C.p.z), new THREE.Vector3(cx + cd * k, cy, C.p.z),
    new THREE.Vector3(px + pd * k, py, P.p.z), new THREE.Vector3(px, py, P.p.z),
  );
  e.mesh.geometry.dispose();
  e.mesh.geometry = new THREE.TubeGeometry(e.curve, 48, e.on ? 2.4 : 1.4, 6, false);
  e.a.position.set(cx + cd * 14, cy + 10, C.p.z);
  e.b.position.set(px + pd * 14, py + 10, P.p.z);
}

// ---------- focus / highlight ----------
function refresh() {
  let focus = S.sim;
  const rv = S.sim?.reveal;   // during the intro tour, tables not yet introduced stay hidden
  if (!focus && S.sel) {
    const t = new Set([S.sel]), ed = new Set();
    edges.forEach((e) => { if (e.child === S.sel || e.parent === S.sel) { t.add(e.child); t.add(e.parent); ed.add(e.id); } });
    focus = { t, e: ed };
  }
  for (const [n, t] of Object.entries(T)) {
    const on = focus?.t.has(n);
    t.tgt = S.hidden.has(t.d) ? 0.12 : rv && !rv.has(n) ? 0.04 : focus && !on ? (rv ? 0.55 : 0.3) : 1;
    t.htgt = on ? 0.9 : 0;
  }
  for (const k of Object.keys(plates)) plates[k].visible = !S.hidden.has(k);
  for (const e of edges) {
    const on = !!focus?.e.has(e.id);
    const gone = rv && !(rv.has(e.child) && rv.has(e.parent));
    e.mat.color.set(on ? "#22d3ee" : "#475569");
    e.tgt = gone ? 0 : focus && !on ? 0.2 : 0.9;
    e.ltgt = gone ? 0 : focus && !on ? 0.2 : 1;
    if (e.on !== on) { e.on = on; place(e); }   // active edges are drawn thicker
  }
}

// ---------- render loop ----------
let last = performance.now(), lastZ = -1;
function tick(now) {
  requestAnimationFrame(tick);
  const k = 1 - Math.exp(-Math.min(0.1, (now - last) / 1000) * 10);
  last = now;
  for (const t of tl) {
    t.cur += (t.tgt - t.cur) * k; t.hcur += (t.htgt - t.hcur) * k;
    t.eff = t.cur * t.enter;
    t.mesh.visible = t.drop.visible = t.eff > 0.01;
    for (const m of t.mats) m.opacity = t.eff;
    t.halo.material.opacity = t.hcur * t.enter;
    t.drop.material.opacity = 0.28 * t.eff;
    t.mesh.scale.setScalar(t.pulse * (0.88 + 0.12 * t.enter));
  }
  for (const e of edges) {
    e.cur += (e.tgt - e.cur) * k; e.lcur += (e.ltgt - e.lcur) * k;
    e.mat.opacity = e.cur * edgeEnter;
    e.mesh.visible = e.a.visible = e.b.visible = e.mat.opacity > 0.01;
    e.a.material.opacity = e.b.material.opacity = e.lcur * edgeEnter;
  }
  controls.update();
  renderer.render(scene, camera);
  Z = fitDist / camera.position.distanceTo(controls.target);
  const z = Math.round(Z * 100);
  if (z !== lastZ) { lastZ = z; $("#zlabel").textContent = z + "%"; }
}
requestAnimationFrame(tick);

function pulse(n, delay = 0, dur = 0.5, amt = 0.06) {
  const t = T[n];
  animate(0, 1, { duration: dur, delay, onUpdate: (v) => (t.pulse = 1 + amt * Math.sin(Math.PI * v)), onComplete: () => (t.pulse = 1) });
}

// ---------- picking + dragging (cards move on a plane facing the camera) ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(ev) {
  const r = cv.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function pick(ev) {
  setRay(ev);
  return ray.intersectObjects(meshes.filter((m) => T[m.userData.n].eff > 0.1), false)[0];
}
// capture phase on the parent, so we can switch orbiting off before OrbitControls sees the press
vp.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  const hit = pick(ev);
  if (!hit) return;
  const n = hit.object.userData.n, t = T[n];
  controls.enabled = false;
  cv.setPointerCapture(ev.pointerId);
  cv.style.cursor = "grabbing";
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), hit.point);
  const off = hit.point.clone().sub(t.p);
  const sx = ev.clientX, sy = ev.clientY;
  let moved = false;
  const mv = (m) => {
    if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return;
    moved = true;
    setRay(m);
    const pt = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, pt)) return;
    pt.sub(off);
    t.p.set(clamp(pt.x, -900, 900), clamp(pt.y, floorY + t.h / 2 + 40, 800), clamp(pt.z, -700, 700));
    syncCard(t);
    edges.forEach((e) => (e.child === n || e.parent === n) && place(e));
  };
  const up = () => {
    cv.removeEventListener("pointermove", mv); cv.removeEventListener("pointerup", up); cv.removeEventListener("pointercancel", up);
    controls.enabled = true; cv.style.cursor = "";
    if (!moved) select(n);
  };
  cv.addEventListener("pointermove", mv); cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
}, true);
cv.addEventListener("pointermove", (ev) => { if (!ev.buttons) cv.style.cursor = pick(ev) ? "pointer" : ""; });

const neighbors = (n) => {
  const s = new Set([n]);
  edges.forEach((e) => { if (e.child === n || e.parent === n) { s.add(e.child); s.add(e.parent); } });
  return [...s];
};
function select(n, scroll) {
  S.sim = null; si = -1; renderDots(); renderStep(); setTab("insp");
  S.sel = S.sel === n && !scroll ? null : n;
  refresh(); renderInsp();
  if (scroll && !auto) focusStep(neighbors(n));
  if (S.sel) pulse(n, 0, 0.4, 0.05);
}

// ---------- inspector ----------
function renderInsp() {
  const n = S.sel, box = $("#insp");
  if (!n) { box.innerHTML = `<p class="text-slate-500">Click any table to see its columns, what it references, and what references it.</p>`; return; }
  const t = T[n], col = DOM[t.d].color;
  const refs = edges.filter((e) => e.child === n), by = edges.filter((e) => e.parent === n);
  const chip = (x, lbl) => `<button data-go="${x}" class="rounded-md bg-slate-800 px-2 py-1 font-mono text-xs hover:bg-slate-700">${lbl}</button>`;
  box.innerHTML = `
    <div class="mb-3 flex items-center gap-2"><span class="size-3 rounded-full" style="background:${col}"></span>
      <span class="font-mono text-base font-semibold text-white">${n}</span><span class="text-xs text-slate-500">${DOM[t.d].label}</span></div>
    <p class="mb-1 mt-4 text-xs uppercase tracking-widest text-slate-500">References (many-to-one)</p>
    <div class="flex flex-wrap gap-2">${refs.length ? refs.map((e) => chip(e.parent, `${e.col} → ${e.parent}`)).join("") : '<span class="text-slate-600">none — a root table</span>'}</div>
    <p class="mb-1 mt-4 text-xs uppercase tracking-widest text-slate-500">Referenced by (one-to-many)</p>
    <div class="flex flex-wrap gap-2">${by.length ? by.map((e) => chip(e.child, `${e.child}.${e.col}`)).join("") : '<span class="text-slate-600">nothing — a leaf table</span>'}</div>`;
  animate("#insp > *", { opacity: [0, 1], y: [8, 0] }, { delay: stagger(0.05), duration: 0.3 });
}
$("#insp").addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) select(b.dataset.go, true); });

// ---------- legend ----------
for (const [k, v] of Object.entries(DOM)) {
  const b = document.createElement("button");
  b.className = "flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1 text-xs backdrop-blur transition hover:border-slate-600";
  b.innerHTML = `<span class="size-2 rounded-full" style="background:${v.color}"></span>${v.label}`;
  b.onclick = () => { S.hidden.has(k) ? S.hidden.delete(k) : S.hidden.add(k); b.style.opacity = S.hidden.has(k) ? 0.4 : 1; refresh(); };
  $("#legend").append(b);
}

// ---------- simulation ----------
const FLOWS = [
  { name: "Place an order", steps: [
    { t: ["customers"], e: [], title: "A customer exists", text: "Everything in sales starts with a customer. The row is created once and referenced by id from then on.", sql: "INSERT INTO customers (customer_first_name, customer_last_name, customer_email)\nVALUES ('Ana', 'Reyes', 'ana@mail.com');  -- customer_id = 101" },
    { t: ["addresses", "customers"], e: ["addresses.customer_id"], title: "Address saved", text: "One customer can have many addresses (home, work, billing). Each address carries customer_id back to its owner.", sql: "INSERT INTO addresses (customer_id, street, city, address_type)\nVALUES (101, '12 Rizal St', 'Iloilo City', 'shipping');  -- address_id = 55" },
    { t: ["orders", "customers", "employees", "addresses"], e: ["orders.customer_id", "orders.employee_id", "orders.shipping_address_id"], title: "Order is created", text: "orders is the hub: it points to who bought (customer), who handled it (employee) and where it ships (address) — three foreign keys.", sql: "INSERT INTO orders (customer_id, employee_id, shipping_address_id, order_status)\nVALUES (101, 7, 55, 'pending');  -- order_id = 9001" },
    { t: ["order_items", "orders", "products"], e: ["order_items.order_id", "order_items.product_id"], title: "Line items link orders to products", text: "orders and products are many-to-many, so order_items sits between them. unit_price is copied from products so future price changes don't rewrite history.", sql: "INSERT INTO order_items (order_id, product_id, quantity, unit_price)\nSELECT 9001, product_id, 2, unit_price FROM products WHERE product_id = 12;" },
    { t: ["inventory", "products"], e: ["inventory.product_id"], title: "Stock goes down", text: "inventory holds one stock row per product. Fulfilling the order reduces quantity_on_hand.", sql: "UPDATE inventory SET quantity_on_hand = quantity_on_hand - 2,\n  last_updated = NOW() WHERE product_id = 12;" },
    { t: ["payments", "orders"], e: ["payments.order_id"], title: "Payment recorded", text: "An order can have several payments (deposit, balance, refund). order_total is the sum of its items.", sql: "INSERT INTO payments (order_id, payment_method, payment_amount, payment_status)\nVALUES (9001, 'gcash', 1998.00, 'paid');" },
    { t: ["shipments", "orders"], e: ["shipments.order_id"], title: "Shipment tracked", text: "The courier and tracking number live in shipments, linked back to the order. delivered_date closes the loop.", sql: "INSERT INTO shipments (order_id, courier, tracking_number, shipped_date)\nVALUES (9001, 'J&T', 'JT123456', CURRENT_DATE);" },
  ]},
  { name: "Low-stock restock", steps: [
    { t: ["inventory", "products"], e: ["inventory.product_id"], title: "Detect low stock", text: "Compare quantity_on_hand with reorder_level to find products that need restocking.", sql: "SELECT p.product_name FROM inventory i\nJOIN products p USING (product_id)\nWHERE i.quantity_on_hand <= i.reorder_level;" },
    { t: ["products", "suppliers"], e: ["products.supplier_id"], title: "Find the supplier", text: "Each product knows its default supplier through supplier_id.", sql: "SELECT s.supplier_name, s.supplier_email FROM products p\nJOIN suppliers s USING (supplier_id) WHERE p.product_id = 12;" },
    { t: ["purchase_orders", "suppliers"], e: ["purchase_orders.supplier_id"], title: "Open a purchase order", text: "A purchase order is addressed to one supplier and tracks status and total cost.", sql: "INSERT INTO purchase_orders (supplier_id, purchase_date, purchase_status)\nVALUES (3, CURRENT_DATE, 'ordered');  -- purchase_id = 410" },
    { t: ["purchase_order_items", "purchase_orders", "products"], e: ["purchase_order_items.purchase_id", "purchase_order_items.product_id"], title: "Add what to buy", text: "Like order_items, purchase_order_items joins purchase orders and products (many-to-many) and stores the negotiated unit_cost.", sql: "INSERT INTO purchase_order_items (purchase_id, product_id, quantity, unit_cost)\nVALUES (410, 12, 50, 640.00);" },
    { t: ["purchase_order_items", "products", "inventory"], e: ["purchase_order_items.product_id", "inventory.product_id"], title: "Goods received", text: "When the shipment arrives, stock is added back to inventory and the purchase order is closed.", sql: "UPDATE inventory SET quantity_on_hand = quantity_on_hand + 50 WHERE product_id = 12;\nUPDATE purchase_orders SET purchase_status = 'received' WHERE purchase_id = 410;" },
  ]},
  { name: "Catalog structure", steps: [
    { t: ["categories"], e: ["categories.category_parent_id"], title: "Self-referencing tree", text: "category_parent_id points back to categories itself, which builds nested categories like Computers → Laptops.", sql: "SELECT c.category_name, p.category_name AS parent\nFROM categories c LEFT JOIN categories p\n  ON c.category_parent_id = p.category_id;" },
    { t: ["products", "categories", "brands", "suppliers"], e: ["products.category_id", "products.brand_id", "products.supplier_id"], title: "A product ties three lookups", text: "products holds three foreign keys: what kind it is, who makes it, and who supplies it.", sql: "SELECT p.product_name, c.category_name, b.brand_name, s.supplier_name\nFROM products p JOIN categories c USING (category_id)\nJOIN brands b USING (brand_id) JOIN suppliers s USING (supplier_id);" },
    { t: ["product_specs", "products"], e: ["product_specs.product_id"], title: "Flexible specs", text: "Instead of one column per spec, product_specs stores name/value pairs (RAM = 16GB) so any product can have any attributes.", sql: "SELECT spec_name, spec_value FROM product_specs WHERE product_id = 12;" },
  ]},
];

// ----- intro tour: every table gets its turn, built up one by one -----
const DESC = {
  brands: "Who makes the products (Samsung, Logitech...). Stored once, so every product just points to a brand_id.",
  categories: "Product types in a tree. category_parent_id points back to this same table, so Laptops can sit inside Computers.",
  suppliers: "The companies we buy stock from, with their contact details.",
  products: "The catalog. Each product links to one category, one brand and one default supplier.",
  product_specs: "Extra details as name/value pairs (RAM = 16GB), so any product can have any specs.",
  inventory: "How many units are in stock, and the reorder_level that tells us when to restock.",
  purchase_orders: "Orders we place with suppliers to restock: date, status and total cost.",
  purchase_order_items: "Which products, how many, and at what cost are on each purchase order.",
  jobs: "A small lookup list of job titles (Cashier, Manager...).",
  employees: "Staff who handle customer orders. Each employee has one job.",
  customers: "The people who buy from the store: name, email and phone.",
  addresses: "A customer's saved addresses (home, work...). One customer can have many.",
  orders: "One row per purchase: who bought, who handled it, where it ships, status and total.",
  order_items: "The products inside each order, with the quantity and the price at the time of sale.",
  payments: "Money received for an order: method, amount, date and status.",
  shipments: "Courier, tracking number and delivery dates for an order.",
};
const ORDER = ["brands", "categories", "suppliers", "products", "product_specs", "inventory", "purchase_orders", "purchase_order_items", "jobs", "employees", "customers", "addresses", "orders", "order_items", "payments", "shipments"];
const INTRO = { name: "Meet the tables", steps: [
  ...ORDER.map((n, i) => {
    const mine = edges.filter((e) => e.child === n);
    const parents = [...new Set(mine.map((e) => e.parent))].filter((p) => p !== n);
    return {
      t: [n, ...parents], e: mine.map((e) => e.id), reveal: ORDER.slice(0, i + 1),
      title: `${i + 1}/${ORDER.length} · ${n}`,
      text: DESC[n] + (parents.length ? ` It links to ${parents.join(", ")}.` : " It doesn't depend on any other table."),
      sql: T[n].cols.map((c) => c.name + (c.k === "pk" ? "   -- PRIMARY KEY" : c.k === "fk" ? `   -- FOREIGN KEY → ${c.ref}` : "")).join("\n"),
    };
  }),
  { t: ORDER, e: edges.map((e) => e.id), reveal: ORDER, fit: true, title: "The full picture",
    text: "Every line is a foreign key: a column in one table that holds the primary key of another. Next, watch real data travel through these links.",
    sql: `-- ${ORDER.length} tables, ${edges.length} foreign keys\n-- Next: how an order flows through them` },
]};
const SC = [INTRO, ...FLOWS];
let sc = 0, si = -1;
const steps = () => SC[sc].steps;

SC.forEach((s, i) => {
  const b = document.createElement("button");
  b.dataset.i = i; b.textContent = s.name;
  b.onclick = () => { sc = i; reset(); styleScen(); };
  $("#scen").append(b);
});
function styleScen() {
  [...$("#scen").children].forEach((b, i) => {
    b.className = "rounded-lg px-3 py-1.5 text-xs font-medium transition " + (i === sc ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/60" : "bg-slate-800 text-slate-300 hover:bg-slate-700");
  });
}
function nextLabel() {
  $("#next").textContent = si < 0 ? "Start →" : si < steps().length - 1 ? "Next step →" : sc === SC.length - 1 ? "Restart ↺" : "Next: " + SC[sc + 1].name + " →";
  $("#prev").disabled = si <= 0 && sc === 0;
}
function renderDots() {
  nextLabel();
  $("#dots").innerHTML = steps().map((_, i) => `<span class="h-1.5 flex-1 rounded-full ${i <= si ? "bg-cyan-400" : "bg-slate-700"}"></span>`).join("");
}
function renderStep() {
  const box = $("#step"), s = steps()[si];
  if (!s) { box.innerHTML = `<p class="text-slate-500">Press <b class="text-slate-300">Start</b> or <b class="text-slate-300">Space</b>. First each table is introduced one by one, then you see how data flows between them. Space = next step.</p>`; return; }
  box.innerHTML = `<p class="mb-1 text-xs text-cyan-400">${SC[sc].name} · Step ${si + 1} of ${steps().length}</p>
    <h3 class="mb-2 text-base font-semibold text-white">${s.title}</h3><p class="mb-3 leading-relaxed">${s.text}</p>
    <pre class="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-300"></pre>`;
  box.querySelector("pre").textContent = s.sql;
  animate(box, { opacity: [0, 1], y: [10, 0] }, { duration: 0.35 });
}

// ---------- camera: fit + fly ----------
const corners = (t) => {
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    out.push(new THREE.Vector3(t.p.x + (sx * W) / 2, t.p.y + (sy * t.h) / 2, t.p.z + (sz * DEPTH) / 2));
  return out;
};
// how far the camera must sit, looking along dir, for these tables to fill the free part of the screen
function distFor(names, dir, padX, padY) {
  const w = vp.clientWidth, h = vp.clientHeight;
  const uw = Math.max(200, w - rm - padX), uh = Math.max(200, h - padY);
  const th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tx = (th * uw) / h, ty = (th * uh) / h;
  const pts = names.flatMap((n) => corners(T[n]));
  const c = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());
  const f = dir.clone().normalize(), right = new THREE.Vector3(0, 1, 0).cross(f).normalize(), up = f.clone().cross(right);
  let D = 0;
  for (const p of pts) {
    const r = p.clone().sub(c), z = r.dot(f);
    D = Math.max(D, Math.abs(r.dot(right)) / tx + z, Math.abs(r.dot(up)) / ty + z);
  }
  return { c, D };
}
let fly;
function flyTo(pos, tgt, dur = 0.9) {
  fly?.stop();
  if (!dur) { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); return; }
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  fly = animate(0, 1, {
    duration: dur, ease: "easeInOut",
    onUpdate: (v) => { camera.position.lerpVectors(p0, pos, v); controls.target.lerpVectors(t0, tgt, v); },
  });
}
function fitAll(animated) {
  const { c, D } = distFor(Object.keys(T), DIR, 80, innerWidth < 700 ? 300 : 230);
  fitDist = D;
  flyTo(c.clone().addScaledVector(DIR, D), c, animated ? 1.1 : 0);
}
function focusStep(names) {
  auto = false;
  const dir = camera.position.clone().sub(controls.target).normalize();   // keep the current viewing angle
  const { c, D } = distFor(names, dir, 120, 200);
  flyTo(c.clone().addScaledVector(dir, Math.max(D, 620)), c, 1);
}
controls.addEventListener("start", () => { auto = false; fly?.stop(); });

function go(i) {
  si = Math.max(0, Math.min(i, steps().length - 1));
  const s = steps()[si];
  S.sel = null; S.sim = { t: new Set(s.t), e: new Set(s.e), reveal: s.reveal ? new Set(s.reveal) : null };
  setTab("sim"); renderDots(); renderStep(); refresh(); renderInsp();
  s.t.forEach((n, k) => pulse(n, k * 0.08, 0.6, 0.07));
  if (s.fit) { auto = true; layout(true); } else focusStep(s.t);
  s.e.forEach((id) => packet(edges.find((e) => e.id === id)));
}
const packetGeo = new THREE.SphereGeometry(6, 16, 12);
const packetMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x22d3ee, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
function packet(e) {
  const dot = new THREE.Mesh(packetGeo, packetMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(46);
  dot.add(glow);
  scene.add(dot);
  animate(0, 1, {
    duration: 1.2, ease: "easeInOut",
    onUpdate: (v) => dot.position.copy(e.curve.getPointAt(1 - v)),   // curve is child→parent; the key travels parent→child
    onComplete: () => scene.remove(dot),
  });
}
function reset() { si = -1; S.sim = null; auto = true; layout(true); renderDots(); renderStep(); refresh(); renderInsp(); }

function advance() {
  if (si < steps().length - 1) return go(si + 1);
  sc = (sc + 1) % SC.length; styleScen(); go(0);          // roll into the next section
}
function back() {
  if (si > 0) return go(si - 1);
  if (sc > 0) { sc--; styleScen(); go(steps().length - 1); }
}
$("#next").onclick = advance;
$("#prev").onclick = back;
$("#reset").onclick = reset;
addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) e.shiftKey ? back() : advance();
    return;
  }
  if (e.key === "ArrowRight") advance();
  if (e.key === "ArrowLeft") back();
});
addEventListener("keyup", (e) => { if (e.code === "Space") e.preventDefault(); });
document.addEventListener("click", (e) => e.target.closest("button")?.blur());

// ---------- overlay: tabs, hide, fullscreen ----------
function setTab(t) {
  $("#sec-sim").classList.toggle("hidden", t !== "sim");
  $("#sec-insp").classList.toggle("hidden", t !== "insp");
  for (const k of ["sim", "insp"]) {
    $("#tab-" + k).className = "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
      (k === t ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/60" : "text-slate-400 hover:bg-slate-800");
  }
}
$("#tab-sim").onclick = () => setTab("sim");
$("#tab-insp").onclick = () => setTab("insp");
function setBody(show) {
  $("#panelBody").classList.toggle("hidden", !show);
  $("#min").textContent = show ? "Hide" : "Show";
  layout();
}
$("#min").onclick = () => setBody($("#panelBody").classList.contains("hidden"));
$("#fs").onclick = () => { erdFS = false; document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); };
$("#efs").onclick = () => { if (document.fullscreenElement) return document.exitFullscreen(); erdFS = true; document.documentElement.requestFullscreen(); };
document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  $("#fs").textContent = on && !erdFS ? "Exit fullscreen" : "Fullscreen";
  $("#efs").textContent = on && erdFS ? "Exit fullscreen" : "ERD fullscreen";
  if (erdFS) setBody(!on);
  if (!on) erdFS = false;
  auto = true; layout();
});

// ---------- zoom / fit ----------
let lw = 0, lh = 0;
function layout(animated = false) {
  const w = vp.clientWidth, h = vp.clientHeight;
  if (!w || !h) return;
  lw = w; lh = h;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  rm = innerWidth < 700 || $("#panelBody").classList.contains("hidden") ? 0 : $("#panel").offsetWidth + 24;
  camera.setViewOffset(w, h, rm / 2, 0, w, h);   // slide the scene left so it centres in the space the panel leaves free
  if (auto) fitAll(animated);
}
const zoomBy = (f) => {
  auto = false;
  const d = camera.position.clone().sub(controls.target).multiplyScalar(f);
  flyTo(controls.target.clone().add(d), controls.target.clone(), 0.25);
};
$("#zin").onclick = () => zoomBy(1 / 1.25);
$("#zout").onclick = () => zoomBy(1.25);
$("#zfit").onclick = () => { auto = true; layout(true); };
new ResizeObserver(() => { if (vp.clientWidth !== lw || vp.clientHeight !== lh) layout(); }).observe(vp);

// ---------- init ----------
edges.forEach(place);
layout();
{ // opening swoop: start off to the side and further back, then glide into the fitted view
  const p = camera.position.clone(), t = controls.target.clone();
  const off = p.clone().sub(t).applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.6).multiplyScalar(1.35);
  off.y += 200;
  camera.position.copy(t).add(off);
  controls.update();
  flyTo(p, t, 1.8);
}
setTab("sim"); styleScen(); renderDots(); renderStep(); renderInsp(); refresh();
animate("#panel", { opacity: [0, 1], x: [24, 0] }, { duration: 0.5, delay: 0.3 });
tl.forEach((t, i) => animate(0, 1, { delay: i * 0.05, duration: 0.6, ease: "easeOut", onUpdate: (v) => (t.enter = v) }));
animate(0, 1, { delay: 0.5, duration: 0.8, onUpdate: (v) => (edgeEnter = v) });
