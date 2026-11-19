// Admin dashboard. Role checks here only decide what to show; Row Level Security and admin_review_payment() enforce it in the database.
const sb = supabase.createClient(CFG.url, CFG.key);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const toast = m => { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500) };
const TABS = { overview: "Overview", orders: "Orders", products: "Products", settings: "Settings" };
let sym = "$";
async function boot() {
  // Never leave a blank screen: fall back to the sign-in form with a message if loading stalls or fails.
  const timer = setTimeout(() => { if ($("#app").hidden && $("#login").hidden) { show(false); $("#le").textContent = "Still loading. Check your connection and refresh, or sign in below." } }, 8000);
  try { await boot0() } catch (e) { show(false); $("#le").textContent = "Could not load admin: " + (e.message || e) }
  clearTimeout(timer);
}
async function boot0() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show(false);
  const { data: pr } = await sb.from("profiles").select("role").eq("id", session.user.id).single();
  if (pr?.role !== "admin") { await sb.auth.signOut(); show(false); $("#le").textContent = "This account is not an admin."; return }
  const s = await sb.from("site_settings").select("value").eq("key", "currency_symbol").single(); sym = s.data?.value || "$";
  show(true); tab("overview");
}
const IC = {
  overview: '<path d="M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-3H4z"/>',
  orders: '<path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10"/>',
  products: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 012-2h13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10l2 2m0-14l-2 2M7 17l-2 2"/>' };
const LAB = { awaiting_payment: "Awaiting payment", submitted: "Needs review", under_review: "Under review", approved: "Approved", rejected: "Rejected" };
const sc = x => x == "approved" ? "ok" : x == "rejected" ? "bad" : "wait", lab = x => LAB[x] || x;
function show(ok) { const b = $("#boot"); if (b) b.hidden = true; $("#login").hidden = ok; $("#app").hidden = !ok; $("#out").hidden = !ok; $("#tabs").hidden = !ok;
  $("#tabs").innerHTML = Object.entries(TABS).map(([k, v]) => `<button class="tb" data-t="${k}"><svg class="i" viewBox="0 0 24 24">${IC[k]}</svg>${v}</button>`).join("") }
async function tab(k) { document.querySelectorAll("#tabs .tb").forEach(b => b.setAttribute("aria-pressed", b.dataset.t == k)); $("#view").innerHTML = "<p class='empty'>Loading…</p>"; window.scrollTo(0, 0); await ({ overview, orders, products, settings })[k]() }

const m = n => sym + Number(n || 0).toFixed(2);

async function overview() {
  const cnt = (t, f) => { let q = sb.from(t).select("*", { count: "exact", head: true }); return f ? f(q) : q };
  const [all, pend, appr, rej, cust, prod, rev, demo, recent, pay] = await Promise.all([
    cnt("orders", q => q.eq("is_demo", false)), cnt("orders", q => q.eq("is_demo", false).in("status", ["submitted", "under_review"])),
    cnt("orders", q => q.eq("is_demo", false).eq("status", "approved")), cnt("orders", q => q.eq("is_demo", false).eq("status", "rejected")),
    cnt("profiles", q => q.eq("role", "customer")), cnt("products", q => q.eq("is_demo", false)),
    sb.from("orders").select("total").eq("status", "approved").eq("is_demo", false), cnt("orders", q => q.eq("is_demo", true)),
    sb.from("orders").select("order_number,customer_name,total,status,created_at").eq("is_demo", false).order("created_at", { ascending: false }).limit(5),
    sb.from("site_settings").select("value").eq("key", "payment_number").single()]);
  const revenue = (rev.data || []).reduce((t, o) => t + +o.total, 0), st = (l, v, c = "") => `<div class="stat ${c}"><span class="meta">${l}</span><b>${v}</b></div>`;
  const todo = []; if (!pay.data?.value) todo.push('Set your Mobile Money number in <a href="#" data-t="settings">Settings</a>'); if (!prod.count) todo.push('Add your first real product in <a href="#" data-t="products">Products</a>');
  $("#view").innerHTML = `<div class="pagehead"><h2>Overview</h2></div>${todo.length ? `<div class="todo"><b>Get started</b><ul>${todo.map(t => `<li>${t}</li>`).join("")}</ul></div>` : ""}<div class="stats">${st("Revenue from approved orders", m(revenue), "big")}${pend.count ? `<div class="stat hot"><span class="meta">Payments to review</span><b>${pend.count}</b><button class="btn sm" data-pend>Review now</button></div>` : st("Payments to review", 0)}${st("Orders", all.count)}${st("Approved", appr.count)}${st("Rejected", rej.count)}${st("Customers", cust.count)}${st("Real products", prod.count)}</div><p class="note">Demo products and ${demo.count} demo order(s) are excluded from revenue and counts.</p><h3 class="sec">Recent sales</h3>${(recent.data || []).map(o => `<div class="row"><div><b>${esc(o.order_number)}</b><span class="meta">${esc(o.customer_name)} · ${new Date(o.created_at).toLocaleDateString()}</span></div><span class="st ${sc(o.status)}">${lab(o.status)}</span><b>${m(o.total)}</b></div>`).join("") || "<p class='empty'>No real orders yet.</p>"}`;
}

let OF = { status: "", q: "" };
async function orders() {
  let q = sb.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (OF.status) q = q.eq("status", OF.status); if (OF.q) q = q.or(`order_number.ilike.%${OF.q.replace(/[%,]/g, "")}%,customer_name.ilike.%${OF.q.replace(/[%,]/g, "")}%,phone.ilike.%${OF.q.replace(/\D/g, "") || "zzz"}%`);
  const { data, error } = await q;
  $("#view").innerHTML = `<div class="acts" style="display:flex;gap:8px;margin-bottom:8px"><input class="f" id="oq" placeholder="Search order, name or phone" value="${esc(OF.q)}"><select class="f" id="os" style="max-width:170px"><option value="">All statuses</option>${["awaiting_payment", "submitted", "under_review", "approved", "rejected"].map(s => `<option ${OF.status == s ? "selected" : ""}>${s}</option>`).join("")}</select></div>${error ? "<p class='err'>Could not load orders.</p>" : (data.map(o => `<div class="row"><div><b>${esc(o.order_number)}</b>${o.is_demo ? " <span class='tag' style='position:static'>demo</span>" : ""}<span class="meta">${esc(o.customer_name)} · ${esc(o.phone)}</span></div><span class="st ${sc(o.status)}">${lab(o.status)}</span><b>${m(o.total)}</b><button class="btn sm ghost" data-o="${o.id}">Open</button></div>`).join("") || "<p class='empty'>No orders match.</p>")}`;
}
async function orderDetail(id) {
  const { data: o } = await sb.from("orders").select("*,order_items(unit_price,products(name)),payment_submissions(*)").eq("id", id).single();
  const subs = await Promise.all((o.payment_submissions || []).map(async s => { let url = ""; if (s.screenshot_path) { const r = await sb.storage.from("payment-screenshots").createSignedUrl(s.screenshot_path, 300); url = r.data?.signedUrl || "" } return { ...s, url } }));
  $("#panel").innerHTML = `<div class="ph"><h2>${esc(o.order_number)}</h2><button class="ib" data-close aria-label="Close">✕</button></div><div class="pay"><dl><dt>Customer</dt><dd>${esc(o.customer_name)}</dd><dt>Phone</dt><dd>${esc(o.phone)}</dd><dt>Email</dt><dd>${esc(o.email || "none")}</dd><dt>Status</dt><dd>${o.status}</dd><dt>Total</dt><dd>${m(o.total)}</dd></dl></div><h3>Items</h3>${o.order_items.map(i => `<p>${esc(i.products.name)} · ${m(i.unit_price)}</p>`).join("")}<h3>Payment submissions</h3>${subs.map(s => `<div class="pay"><p>Transaction ID: <b>${esc(s.transaction_ref || "none")}</b> · ${s.status}</p>${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">View screenshot</a>` : "<p class='note'>No screenshot</p>"}</div>`).join("") || "<p class='note'>None yet.</p>"}${o.rejection_reason ? `<p><b>Rejection reason:</b> ${esc(o.rejection_reason)}</p>` : ""}${o.user_id ? '<p class="note">This customer has an account. Approving adds the product to their library and sends them a notification.</p>' : '<p class="note"><b>Guest order.</b> No account is linked, so no notification is sent. After you approve, the customer must sign in and tap Link my orders with this phone number.</p>'}<p class="note">Check the amount and sender in your Mobile Money records before approving.</p><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-ap="${o.id}">Approve payment</button><button class="btn ghost" data-rj="${o.id}">Reject</button><button class="btn ghost" data-rv="${o.id}">Revoke access</button></div>`;
  $("#sheet").classList.add("on");
}
async function review(id, ok) {
  let reason = null; if (!ok) { reason = prompt("Reason for rejecting (the customer will see this):"); if (!reason) return }
  else if (!confirm("Approve this payment and grant access?")) return;
  const { error } = await sb.rpc("admin_review_payment", { p_order: id, p_approve: ok, p_reason: reason });
  if (error) return toast("Failed: " + error.message); toast(ok ? "Approved. The customer sees it in their account." : "Rejected"); $("#sheet").classList.remove("on"); tab("orders");
}
async function revoke(id) { if (!confirm("Revoke access for this order's products?")) return; const { error } = await sb.from("customer_library").update({ revoked: true }).eq("order_id", id); toast(error ? "Failed" : "Access revoked") }

async function products() {
  const [{ data }, { data: cats }] = await Promise.all([sb.from("products").select("*,categories(name)").order("created_at", { ascending: false }), sb.from("categories").select("*").order("id")]);
  const { data: files } = await sb.from("digital_products").select("product_id"); const hasFile = new Set((files || []).map(x => x.product_id));
  window._cats = cats; window._prods = data;
  const img = p => p.cover_path ? `<img alt="" src="${sb.storage.from("covers").getPublicUrl(p.cover_path).data.publicUrl}">` : esc((p.name || "?")[0]);
  $("#view").innerHTML = `<div class="pagehead"><h2>Products</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-pf="">New product</button>${data.some(p => p.is_demo) ? '<button class="btn ghost" data-cleardemo>Remove demo data</button>' : ""}</div></div>${data.map(p => `<div class="pcard"><div class="th">${img(p)}</div><div class="pi"><b>${esc(p.name)}</b><span class="meta">${p.type}${p.is_demo ? " · demo" : ""} · ${esc(p.categories?.name || "No category")}</span><div class="price" style="margin:0"><b>${m(p.sale_price)}</b>${p.is_on_sale ? `<s>${m(p.original_price)}</s><span class="off2">${p.discount_percentage}% off</span>` : ""}</div><span><span class="st ${p.is_published ? "ok" : "wait"}">${p.is_published ? "Published" : "Draft"}</span> ${p.type != "course" && !hasFile.has(p.id) ? '<span class="st bad">No file uploaded</span>' : ""}</span></div><div class="pa"><button class="btn sm" data-pf="${p.id}">Edit</button>${p.type == "course" ? `<button class="btn sm ghost" data-ls="${p.id}" data-n="${esc(p.name)}">Lessons</button>` : ""}<button class="btn sm ghost" data-pub="${p.id}" data-v="${p.is_published}">${p.is_published ? "Unpublish" : "Publish"}</button><button class="btn sm ghost" data-del="${p.id}">Delete</button></div></div>`).join("") || "<p class='empty'>No products yet. Tap New product to add your first eBook or course.</p>"}`;
}
function productForm(id) {
  const p = (window._prods || []).find(x => x.id == id) || { type: "ebook", flow_steps: [], learn_points: [], included: [] };
  const f = (k, l, v, t = "text", extra = "") => `<label>${l}</label><input class="f" data-k="${k}" type="${t}" ${extra} value="${esc(v ?? "")}">`;
  $("#panel").innerHTML = `<div class="ph"><h2>${id ? "Edit" : "New"} product</h2><button class="ib" data-close aria-label="Close">✕</button></div>
<div class="fs"><h3>Basics</h3>${f("name", "Name", p.name)}${f("slug", "Web address name (lowercase letters, numbers, hyphens)", p.slug)}<label>Type</label><select class="f" data-k="type">${["ebook", "course", "bundle", "resource"].map(t => `<option ${p.type == t ? "selected" : ""}>${t}</option>`).join("")}</select><label>Category</label><select class="f" data-k="category_id">${window._cats.map(c => `<option value="${c.id}" ${p.category_id == c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>${f("short_description", "Short description (shown on the card)", p.short_description)}</div>
<div class="fs"><h3>Pricing</h3>${f("original_price", "Original price (leave empty if not discounted)", p.original_price, "number", 'min="0" step="0.01" inputmode="decimal"')}${f("sale_price", "Selling price", p.sale_price, "number", 'min="0" step="0.01" inputmode="decimal"')}<p class="note" id="dp"></p></div>
<div class="fs"><h3>What customers see</h3><label>Full description</label><textarea class="f" data-k="description">${esc(p.description)}</textarea>${f("flow", "Illustration steps, separated by commas (e.g. Prompt, AI scene, Video, Final content)", (p.flow_steps || []).join(", "))}<label>What the customer will learn (one per line)</label><textarea class="f" data-k="learn">${esc((p.learn_points || []).join("\n"))}</textarea><label>What is included (one per line)</label><textarea class="f" data-k="incl">${esc((p.included || []).join("\n"))}</textarea>${f("requirements", "Requirements (optional)", p.requirements)}</div>
<div class="fs"><h3>Files</h3><label>Cover image (JPG, PNG or WebP, up to 2 MB)</label><input class="f" id="cv" type="file" accept="image/png,image/jpeg,image/webp"><label>Product file for eBooks and downloads (PDF, ZIP, etc.)</label><input class="f" id="pf" type="file"><p class="note">Files are stored privately. Only customers with approved access can download them. Your Supabase plan sets the maximum file size (50 MB on the free plan). Courses use lesson links instead, added after saving.</p></div>
<div class="fs"><h3>Visibility</h3><label class="lesson"><input type="checkbox" data-k="is_published" ${p.is_published ? "checked" : ""}> Published (visible in the store)</label><label class="lesson"><input type="checkbox" data-k="is_demo" ${p.is_demo ? "checked" : ""}> Demo product (excluded from revenue)</label></div>
<div class="savebar"><div class="err" id="pe" role="alert"></div><button class="btn" style="width:100%" data-save="${id || ""}">Save product</button></div>`;
  $("#sheet").classList.add("on"); prevDisc();
}
function prevDisc() { const o = document.querySelector('[data-k="original_price"]'), s = document.querySelector('[data-k="sale_price"]'), d = $("#dp"); if (!o || !d) return;
  const a = parseFloat(o.value), b = parseFloat(s.value); d.textContent = a > b ? `Customers will see ${Math.round((1 - b / a) * 100)}% OFF, calculated automatically.` : "No discount shown. Add a higher original price to show a sale." }
document.addEventListener("input", ev => { if (ev.target.dataset?.k == "original_price" || ev.target.dataset?.k == "sale_price") prevDisc() });

// ----- course lessons -----
async function lessonsPanel(pid, name) {
  const { data } = await sb.from("course_lessons").select("*").eq("course_id", pid).order("position"); window._les = data || [];
  $("#panel").innerHTML = `<div class="ph"><h2>Lessons</h2><button class="ib" data-close aria-label="Close">✕</button></div><p class="meta">${esc(name || "")}</p>${window._les.map(l => `<div class="row"><div><b>${l.position}. ${esc(l.title)}</b><span class="meta">${l.video_url ? esc(l.video_url).slice(0, 44) : "No video link"}</span></div><div><button class="btn sm ghost" data-le="${l.id}">Edit</button> <button class="btn sm ghost" data-lsd="${l.id}" data-p="${pid}" data-n="${esc(name || "")}">Delete</button></div></div>`).join("") || "<p class='empty'>No lessons yet.</p>"}
<div class="fs"><h3 id="lh">Add a lesson</h3><label>Lesson title</label><input class="f" id="lt"><label>Video link (https)</label><input class="f" id="lv" type="url" placeholder="https://"><p class="note">Use an unlisted YouTube or Vimeo video, or a Google Drive share link. Only customers who bought the course see the link inside the app, but anyone who has a link can share it.</p><label>Notes (optional)</label><textarea class="f" id="ln"></textarea><label>Lesson number</label><input class="f" id="lp" type="number" min="1" value="${window._les.length + 1}"><div class="err" id="pe" role="alert"></div><button class="btn" style="margin-top:12px" data-lsave="${pid}" data-n="${esc(name || "")}">Save lesson</button></div>`;
  $("#sheet").classList.add("on");
}
function lessonFill(id) { const l = window._les.find(x => x.id == id); $("#lt").value = l.title; $("#lv").value = l.video_url || ""; $("#ln").value = l.content || ""; $("#lp").value = l.position; $("#lh").textContent = "Edit lesson"; document.querySelector("[data-lsave]").dataset.lid = id; $("#lt").scrollIntoView() }
async function saveLesson(pid, name, lid) {
  const title = $("#lt").value.trim(), v = $("#lv").value.trim(), pe = $("#pe");
  if (!title) return pe.textContent = "Enter a lesson title.";
  if (v && !/^https:\/\//.test(v)) return pe.textContent = "The video link must start with https://";
  const row = { course_id: pid, title, video_url: v || null, content: $("#ln").value.trim() || null, position: +$("#lp").value || 1 };
  await sb.from("courses").upsert({ product_id: pid });
  const r = lid ? await sb.from("course_lessons").update(row).eq("id", lid) : await sb.from("course_lessons").insert(row);
  if (r.error) return pe.textContent = r.error.code == "23505" ? "That lesson number is already used. Pick another." : "Could not save: " + r.error.message;
  toast("Lesson saved"); lessonsPanel(pid, name);
}
async function delLesson(id, pid, name) { if (!confirm("Delete this lesson?")) return; await sb.from("course_lessons").delete().eq("id", id); lessonsPanel(pid, name) }

async function saveProduct(id) {
  const g = k => document.querySelector(`[data-k="${k}"]`), v = k => g(k).type == "checkbox" ? g(k).checked : g(k).value.trim(), lines = k => v(k).split("\n").map(s => s.trim()).filter(Boolean), pe = $("#pe");
  const row = { name: v("name"), slug: v("slug"), type: v("type"), category_id: +v("category_id"), original_price: v("original_price") === "" ? null : +v("original_price"), sale_price: +v("sale_price"), short_description: v("short_description"), description: v("description"), flow_steps: v("flow").split(",").map(s => s.trim()).filter(Boolean), learn_points: lines("learn"), included: lines("incl"), requirements: v("requirements"), is_published: v("is_published"), is_demo: v("is_demo"), updated_at: new Date().toISOString() };
  if (!row.name || !/^[a-z0-9-]+$/.test(row.slug) || !(row.sale_price >= 0)) return pe.textContent = "Enter a name, a valid slug and a selling price.";
  pe.textContent = "Saving. Large files can take a while, keep this open…";
  const cv = $("#cv").files[0], pf = $("#pf").files[0];
  if (cv && cv.size > 2097152) return pe.textContent = "Cover must be under 2 MB.";
  if (cv) { const path = `${row.slug}-${Date.now()}.${cv.name.split(".").pop()}`; const u = await sb.storage.from("covers").upload(path, cv); if (u.error) return pe.textContent = "Cover upload failed."; row.cover_path = path }
  const r = id ? await sb.from("products").update(row).eq("id", id).select().single() : await sb.from("products").insert(row).select().single();
  if (r.error) return pe.textContent = "Could not save: " + r.error.message;
  if (pf) { const path = `${row.slug}/${Date.now()}-${pf.name.replace(/[^\w.-]/g, "_")}`; const u = await sb.storage.from("product-files").upload(path, pf); if (u.error) return pe.textContent = "Saved, but file upload failed: " + u.error.message;
    await sb.from("digital_products").delete().eq("product_id", r.data.id); await sb.from("digital_products").insert({ product_id: r.data.id, file_name: pf.name, storage_path: path }) }
  if (row.type == "course") await sb.from("courses").upsert({ product_id: r.data.id });
  toast("Saved"); tab("products"); if (row.type == "course") return lessonsPanel(r.data.id, row.name); $("#sheet").classList.remove("on");
}

const SL = { store_name: "Store name", payment_method: "Payment method (e.g. Orange Money)", payment_recipient: "Recipient name", payment_number: "Mobile Money number", payment_instructions: "Payment instructions shown at checkout", currency_symbol: "Currency symbol", support_contact: "Support contact (WhatsApp or email)" };
async function settings() {
  const { data } = await sb.from("site_settings").select("*").order("key");
  $("#view").innerHTML = `<div class="pagehead"><h2>Settings</h2></div><div class="fs">${data.map(x => `<label for="s-${x.key}">${SL[x.key] || x.key}</label><input class="f" id="s-${x.key}" data-s="${x.key}" value="${esc(x.value)}">`).join("")}</div><p class="note">Customers see the payment details at checkout. Double-check the number.</p><button class="btn" data-savesettings>Save settings</button>`;
}

document.addEventListener("click", async ev => {
  const link = ev.target.closest("a[data-t]"); if (link) { ev.preventDefault(); return tab(link.dataset.t) }
  const t = ev.target.closest("button,.sheet"), D = t?.dataset; if (!t) return;
  if (D.t) tab(D.t); else if (D.o) orderDetail(D.o); else if (D.ap) review(D.ap, true); else if (D.rj) review(D.rj, false); else if (D.rv) revoke(D.rv);
  else if (D.pend !== undefined) { OF.status = "submitted"; tab("orders") } else if (D.ls) lessonsPanel(D.ls, D.n); else if (D.le) lessonFill(D.le); else if (D.lsave !== undefined) saveLesson(D.lsave, D.n, D.lid); else if (D.lsd) delLesson(D.lsd, D.p, D.n); else if (D.pf !== undefined) productForm(D.pf); else if (D.save !== undefined) saveProduct(D.save);
  else if (D.pub) { const r = await sb.from("products").update({ is_published: D.v != "true" }).eq("id", D.pub); if (r.error) toast("Could not update: " + r.error.message); tab("products") }
  else if (D.del) { if (confirm("Delete this product permanently? Its demo orders are removed too. This cannot be undone.")) { const { error } = await sb.rpc("admin_delete_product", { p_product: D.del }); toast(error ? (error.message.includes("real orders") ? "This product has real orders. Unpublish it instead." : "Could not delete. Run 003_admin_tools.sql in Supabase first.") : "Deleted"); tab("products") } }
  else if (D.cleardemo !== undefined) { if (confirm("Delete ALL demo products and demo orders?")) { const { data, error } = await sb.rpc("admin_clear_demo"); toast(error ? "Could not clear. Run 003_admin_tools.sql in Supabase first." : `Removed ${data} demo product(s)`); tab("products") } }
  else if (D.savesettings !== undefined) { const rows = [...document.querySelectorAll("[data-s]")].map(i => ({ key: i.dataset.s, value: i.value })); const r = await Promise.all(rows.map(x => sb.from("site_settings").update({ value: x.value }).eq("key", x.key))); toast(r.some(x => x.error) ? "Some settings failed" : "Settings saved") }
  else if (D.close !== undefined || (t.id == "sheet" && ev.target == t)) $("#sheet").classList.remove("on");
  else if (t.id == "go") { const { error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value }); if (error) $("#le").textContent = error.message; else boot() }
  else if (t.id == "out") { await sb.auth.signOut(); location.reload() }
});
document.addEventListener("change", ev => { if (ev.target.id == "os") { OF.status = ev.target.value; orders() } });
document.addEventListener("keydown", ev => { if (ev.key == "Enter" && ev.target.id == "oq") { OF.q = ev.target.value.trim(); orders() } });
boot();
