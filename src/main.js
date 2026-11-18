import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@11.18.2/+esm";

const W = 220, H0 = 34, R = 24;
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

const NS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);
const S = { sel: null, sim: null, hidden: new Set() };
const edges = [];
let Z = 1, auto = true, erdFS = false;
let view = { ox: 0, oy: 0 };

for (const [n, t] of Object.entries(T)) {
  t.cols = t.c.map((s) => { const [name, k, ref] = s.split(" "); return { name, k, ref }; });
  t.cols.forEach((c, i) => {
    if (c.k === "fk") edges.push({ id: `${n}.${c.name}`, child: n, col: c.name, ci: i, parent: c.ref, pi: T[c.ref] ? 0 : 0 });
  });
}
const pkIndex = (n) => Math.max(0, T[n].cols.findIndex((c) => c.k === "pk"));
edges.forEach((e) => (e.pi = pkIndex(e.parent)));

// ---------- build cards ----------
for (const [n, t] of Object.entries(T)) {
  const col = DOM[t.d].color;
  const el = document.createElement("div");
  el.className = "card absolute w-[220px] select-none rounded-xl border bg-slate-900 shadow-lg shadow-black/50 transition-[opacity,box-shadow] duration-300";
  el.style.cssText = `left:${t.x}px;top:${t.y}px;border-color:${col}55`;
  el.innerHTML =
    `<div data-h class="flex h-[34px] cursor-grab items-center gap-2 rounded-t-xl px-3 text-sm font-semibold active:cursor-grabbing" style="background:${col}22;color:${col}"><span class="size-2 rounded-full" style="background:${col}"></span>${n}</div>` +
    t.cols.map((c) => {
      const b = c.k === "pk" ? `<span class="rounded bg-amber-400/20 px-1 text-[10px] font-bold text-amber-300">PK</span>`
        : c.k === "fk" ? `<span class="rounded bg-cyan-400/20 px-1 text-[10px] font-bold text-cyan-300">FK</span>` : "";
      return `<div class="flex h-6 items-center justify-between px-3 font-mono text-xs ${c.k === "pk" ? "text-amber-100" : "text-slate-300"}"><span>${c.name}</span>${b}</div>`;
    }).join("");
  t.el = el;
  $("#cards").append(el);
  el.addEventListener("pointerdown", (ev) => startDrag(ev, n));
}

// ---------- edges ----------
for (const e of edges) {
  e.el = document.createElementNS(NS, "path");
  e.el.setAttribute("fill", "none");
  e.el.setAttribute("stroke-linecap", "round");
  $("#paths").append(e.el);
  for (const k of ["a", "b"]) {
    e[k] = document.createElementNS(NS, "text");
    e[k].setAttribute("font-size", "11");
    e[k].setAttribute("font-weight", "700");
    e[k].setAttribute("fill", "#94a3b8");
    e[k].textContent = k === "a" ? "N" : "1";
    $("#labels").append(e[k]);
  }
}
function place(e) {
  const C = T[e.child], P = T[e.parent];
  const cy = C.y + H0 + e.ci * R + R / 2, py = P.y + H0 + e.pi * R + R / 2;
  let cx, px, cd, pd;
  if (C.x > P.x) { cx = C.x; cd = -1; px = P.x + W; pd = 1; }
  else if (C.x < P.x) { cx = C.x + W; cd = 1; px = P.x; pd = -1; }
  else { cx = C.x + W; cd = 1; px = P.x + W; pd = 1; }
  const k = C.x === P.x ? 60 : Math.max(40, Math.abs(cx - px) / 2);
  e.el.setAttribute("d", `M${cx} ${cy} C${cx + cd * k} ${cy},${px + pd * k} ${py},${px} ${py}`);
  e.a.setAttribute("x", cx + (cd > 0 ? 6 : -14)); e.a.setAttribute("y", cy - 5);
  e.b.setAttribute("x", px + (pd > 0 ? 6 : -10)); e.b.setAttribute("y", py - 5);
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
    t.el.style.opacity = S.hidden.has(t.d) ? 0.12 : rv && !rv.has(n) ? 0.04 : focus && !on ? (rv ? 0.55 : 0.3) : 1;
    t.el.style.boxShadow = on ? `0 0 0 2px ${DOM[t.d].color}, 0 0 28px ${DOM[t.d].color}55` : "";
  }
  for (const e of edges) {
    const on = focus?.e.has(e.id);
    const gone = rv && !(rv.has(e.child) && rv.has(e.parent));
    e.el.setAttribute("stroke", on ? "#22d3ee" : "#475569");
    e.el.setAttribute("stroke-width", on ? 2.5 : 1.5);
    e.el.setAttribute("opacity", gone ? 0 : focus && !on ? 0.2 : 0.9);
    e.el.classList.toggle("edge-active", !!on && !!S.sim);
    e.a.setAttribute("opacity", gone ? 0 : focus && !on ? 0.2 : 1);
    e.b.setAttribute("opacity", gone ? 0 : focus && !on ? 0.2 : 1);
  }
}

// ---------- dragging ----------
function startDrag(ev, n) {
  const t = T[n], sx = ev.clientX, sy = ev.clientY, ox = t.x, oy = t.y;
  let moved = false;
  t.el.setPointerCapture(ev.pointerId);
  const mv = (m) => {
    const dx = (m.clientX - sx) / Z, dy = (m.clientY - sy) / Z;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    if (!moved) return;
    t.x = Math.max(0, Math.min(1040, ox + dx)); t.y = Math.max(0, Math.min(1000, oy + dy));
    t.el.style.left = t.x + "px"; t.el.style.top = t.y + "px";
    edges.forEach((e) => (e.child === n || e.parent === n) && place(e));
  };
  const up = () => {
    t.el.removeEventListener("pointermove", mv); t.el.removeEventListener("pointerup", up);
    if (!moved) select(n);
  };
  t.el.addEventListener("pointermove", mv); t.el.addEventListener("pointerup", up);
}
function select(n, scroll) {
  S.sim = null; si = -1; renderDots(); renderStep(); setTab("insp");
  S.sel = S.sel === n && !scroll ? null : n;
  refresh(); renderInsp();
  if (scroll && !auto) T[n].el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  if (S.sel) animate(T[n].el, { scale: [1, 1.04, 1] }, { duration: 0.4 });
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
function focusStep(names) {
  const ts = names.map((n) => T[n]);
  const x0 = Math.min(...ts.map((t) => t.x)), x1 = Math.max(...ts.map((t) => t.x + W));
  const y0 = Math.min(...ts.map((t) => t.y)), y1 = Math.max(...ts.map((t) => t.y + H0 + t.cols.length * R));
  const vp = $("#viewport");
  const rm = innerWidth < 700 || $("#panelBody").classList.contains("hidden") ? 0 : $("#panel").offsetWidth + 24;
  auto = false;
  Z = Math.max(0.5, Math.min(1.1, (vp.clientWidth - rm - 120) / (x1 - x0), (vp.clientHeight - 200) / (y1 - y0)));
  layout();
  vp.scrollTo({
    left: view.ox + ((x0 + x1) / 2) * Z - (vp.clientWidth - rm) / 2,
    top: view.oy + ((y0 + y1) / 2) * Z - vp.clientHeight / 2,
    behavior: "smooth",
  });
}
function go(i) {
  si = Math.max(0, Math.min(i, steps().length - 1));
  const s = steps()[si];
  S.sel = null; S.sim = { t: new Set(s.t), e: new Set(s.e), reveal: s.reveal ? new Set(s.reveal) : null };
  setTab("sim"); renderDots(); renderStep(); refresh(); renderInsp();
  animate(s.t.map((n) => T[n].el), { scale: [1, 1.05, 1] }, { duration: 0.6, delay: stagger(0.08) });
  if (s.fit) { auto = true; layout(); } else focusStep(s.t);
  s.e.forEach((id) => packet(edges.find((e) => e.id === id)));
}
function packet(e) {
  const len = e.el.getTotalLength();
  const dot = document.createElementNS(NS, "circle");
  dot.setAttribute("r", 6); dot.setAttribute("fill", "#22d3ee");
  dot.setAttribute("style", "filter:drop-shadow(0 0 6px #22d3ee)");
  $("#packets").append(dot);
  animate(0, 1, { duration: 1.2, ease: "easeInOut", onUpdate: (v) => {
    const p = e.el.getPointAtLength((1 - v) * len);  // path is child→parent; packet flows parent→child (the key travels down)
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y);
  }, onComplete: () => dot.remove() });
}
function reset() { si = -1; S.sim = null; auto = true; layout(); renderDots(); renderStep(); refresh(); renderInsp(); }
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
function layout() {
  const vp = $("#viewport"), vw = vp.clientWidth, vh = vp.clientHeight;
  const narrow = innerWidth < 700;
  const rm = narrow || $("#panelBody").classList.contains("hidden") ? 0 : $("#panel").offsetWidth + 24;
  // equal margins on both sides so the ERD sits dead-center; the right margin also clears the panel
  const mx = Math.max(24, rm), my = narrow ? 150 : 110;
  // measure the real extent of the tables, not the whole canvas
  const ts = Object.values(T);
  const bx0 = Math.min(...ts.map((t) => t.x)), bx1 = Math.max(...ts.map((t) => t.x + W));
  const by0 = Math.min(...ts.map((t) => t.y)), by1 = Math.max(...ts.map((t) => t.y + H0 + t.cols.length * R));
  const cw = bx1 - bx0, ch = by1 - by0;
  if (auto) Z = Math.max(0.3, Math.min(1.6, (vw - 2 * mx) / cw, (vh - 2 * my) / ch));
  const sw = Math.max(vw, cw * Z + 2 * mx), sh = Math.max(vh, ch * Z + 2 * my);
  const ox = (sw - cw * Z) / 2 - bx0 * Z, oy = (sh - ch * Z) / 2 - by0 * Z;
  view = { ox, oy };
  $("#canvas").style.transform = `translate(${ox}px,${oy}px) scale(${Z})`;
  $("#sizer").style.width = sw + "px";
  $("#sizer").style.height = sh + "px";
  $("#zlabel").textContent = Math.round(Z * 100) + "%";
}
const zoom = (d) => { auto = false; Z = Math.max(0.3, Math.min(2.2, Z + d)); layout(); };
$("#zin").onclick = () => zoom(0.15);
$("#zout").onclick = () => zoom(-0.15);
$("#zfit").onclick = () => { auto = true; layout(); };
$("#viewport").addEventListener("wheel", (e) => { if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 0.1 : -0.1); } }, { passive: false });
addEventListener("resize", layout);

// ---------- init ----------
edges.forEach(place);
layout();
setTab("sim"); styleScen(); renderDots(); renderStep(); renderInsp(); refresh();
animate("#panel", { opacity: [0, 1], x: [24, 0] }, { duration: 0.5, delay: 0.3 });
animate(".card", { opacity: [0, 1], y: [24, 0] }, { delay: stagger(0.05), duration: 0.5 }).then(refresh);
animate("#edges", { opacity: [0, 1] }, { delay: 0.5, duration: 0.8 });