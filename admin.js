// Admin dashboard. Role checks here only decide what to show; Row Level Security and admin_review_payment() enforce it in the database.
const sb = supabase.createClient(CFG.url, CFG.key);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const toast = m => { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500) };
const TABS = { overview: "Overview", orders: "Orders", products: "Products", settings: "Settings" };
let sym = "$";
async function boot() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return show(false);
  const { data: pr } = await sb.from("profiles").select("role").eq("id", session.user.id).single();
  if (pr?.role !== "admin") { await sb.auth.signOut(); show(false); $("#le").textContent = "This account is not an admin."; return }
  const s = await sb.from("site_settings").select("value").eq("key", "currency_symbol").single(); sym = s.data?.value || "$";
  show(true); tab("overview");
}
function show(ok) { $("#login").hidden = ok; $("#app").hidden = !ok; $("#out").hidden = !ok;
  $("#tabs").innerHTML = Object.entries(TABS).map(([k, v]) => `<button class="chip" data-t="${k}">${v}</button>`).join("") }
async function tab(k) { document.querySelectorAll("#tabs .chip").forEach(b => b.setAttribute("aria-pressed", b.dataset.t == k)); $("#view").innerHTML = "<p class='empty'>Loading…</p>"; await ({ overview, orders, products, settings })[k]() }
const m = n => sym + Number(n || 0).toFixed(2);

async function overview() {
  const cnt = (t, f) => { let q = sb.from(t).select("*", { count: "exact", head: true }); return f ? f(q) : q };
  const [all, pend, appr, rej, cust, prod, rev, demo, recent] = await Promise.all([
    cnt("orders", q => q.eq("is_demo", false)), cnt("orders", q => q.eq("is_demo", false).in("status", ["submitted", "under_review"])),
    cnt("orders", q => q.eq("is_demo", false).eq("status", "approved")), cnt("orders", q => q.eq("is_demo", false).eq("status", "rejected")),
    cnt("profiles", q => q.eq("role", "customer")), cnt("products"),
    sb.from("orders").select("total").eq("status", "approved").eq("is_demo", false), cnt("orders", q => q.eq("is_demo", true)),
    sb.from("orders").select("order_number,customer_name,total,status,created_at").eq("is_demo", false).order("created_at", { ascending: false }).limit(5)]);
  const revenue = (rev.data || []).reduce((s, o) => s + +o.total, 0);
  const st = (l, v) => `<div class="stat"><span class="meta">${l}</span><b>${v}</b></div>`;
  $("#view").innerHTML = `<div class="stats">${st("Revenue (approved)", m(revenue))}${st("Orders", all.count)}${st("Pending payments", pend.count)}${st("Approved", appr.count)}${st("Rejected", rej.count)}${st("Customers", cust.count)}${st("Products", prod.count)}</div><p class="note">Demo orders (${demo.count}) are excluded from every figure above.</p><h3 class="sec">Recent sales</h3>${(recent.data || []).map(o => `<div class="row"><div><b>${esc(o.order_number)}</b><span class="meta">${esc(o.customer_name)} · ${new Date(o.created_at).toLocaleDateString()}</span></div><span class="st">${o.status}</span><b>${m(o.total)}</b></div>`).join("") || "<p class='empty'>No real orders yet.</p>"}`;
}

let OF = { status: "", q: "" };
async function orders() {
  let q = sb.from("orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (OF.status) q = q.eq("status", OF.status); if (OF.q) q = q.or(`order_number.ilike.%${OF.q.replace(/[%,]/g, "")}%,customer_name.ilike.%${OF.q.replace(/[%,]/g, "")}%,phone.ilike.%${OF.q.replace(/\D/g, "") || "zzz"}%`);
  const { data, error } = await q;
  $("#view").innerHTML = `<div class="acts" style="display:flex;gap:8px;margin-bottom:8px"><input class="f" id="oq" placeholder="Search order, name or phone" value="${esc(OF.q)}"><select class="f" id="os" style="max-width:170px"><option value="">All statuses</option>${["awaiting_payment", "submitted", "under_review", "approved", "rejected"].map(s => `<option ${OF.status == s ? "selected" : ""}>${s}</option>`).join("")}</select></div>${error ? "<p class='err'>Could not load orders.</p>" : (data.map(o => `<div class="row"><div><b>${esc(o.order_number)}</b>${o.is_demo ? " <span class='tag' style='position:static'>demo</span>" : ""}<span class="meta">${esc(o.customer_name)} · ${esc(o.phone)}</span></div><span class="st">${o.status}</span><b>${m(o.total)}</b><button class="btn sm ghost" data-o="${o.id}">Open</button></div>`).join("") || "<p class='empty'>No orders match.</p>")}`;
}
async function orderDetail(id) {
  const { data: o } = await sb.from("orders").select("*,order_items(unit_price,products(name)),payment_submissions(*)").eq("id", id).single();
  const subs = await Promise.all((o.payment_submissions || []).map(async s => { let url = ""; if (s.screenshot_path) { const r = await sb.storage.from("payment-screenshots").createSignedUrl(s.screenshot_path, 300); url = r.data?.signedUrl || "" } return { ...s, url } }));
  $("#panel").innerHTML = `<div class="ph"><h2>${esc(o.order_number)}</h2><button class="ib" data-close aria-label="Close">✕</button></div><div class="pay"><dl><dt>Customer</dt><dd>${esc(o.customer_name)}</dd><dt>Phone</dt><dd>${esc(o.phone)}</dd><dt>Email</dt><dd>${esc(o.email || "none")}</dd><dt>Status</dt><dd>${o.status}</dd><dt>Total</dt><dd>${m(o.total)}</dd></dl></div><h3>Items</h3>${o.order_items.map(i => `<p>${esc(i.products.name)} · ${m(i.unit_price)}</p>`).join("")}<h3>Payment submissions</h3>${subs.map(s => `<div class="pay"><p>Transaction ID: <b>${esc(s.transaction_ref || "none")}</b> · ${s.status}</p>${s.url ? `<a href="${s.url}" target="_blank" rel="noopener">View screenshot</a>` : "<p class='note'>No screenshot</p>"}</div>`).join("") || "<p class='note'>None yet.</p>"}${o.rejection_reason ? `<p><b>Rejection reason:</b> ${esc(o.rejection_reason)}</p>` : ""}<p class="note">Check the amount and sender in your Mobile Money records before approving.</p><div class="acts" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-ap="${o.id}">Approve payment</button><button class="btn ghost" data-rj="${o.id}">Reject</button><button class="btn ghost" data-rv="${o.id}">Revoke access</button></div>`;
  $("#sheet").classList.add("on");
}
async function review(id, ok) {
  let reason = null; if (!ok) { reason = prompt("Reason for rejecting (the customer will see this):"); if (!reason) return }
  else if (!confirm("Approve this payment and grant access?")) return;
  const { error } = await sb.rpc("admin_review_payment", { p_order: id, p_approve: ok, p_reason: reason });
  if (error) return toast("Failed: " + error.message); toast(ok ? "Approved" : "Rejected"); $("#sheet").classList.remove("on"); tab("orders");
}
async function revoke(id) { if (!confirm("Revoke access for this order's products?")) return; const { error } = await sb.from("customer_library").update({ revoked: true }).eq("order_id", id); toast(error ? "Failed" : "Access revoked") }

async function products() {
  const [{ data }, { data: cats }] = await Promise.all([sb.from("products").select("*,categories(name)").order("created_at", { ascending: false }), sb.from("categories").select("*").order("id")]);
  window._cats = cats; window._prods = data;
  $("#view").innerHTML = `<button class="btn" data-pf="">Add product</button>${data.map(p => `<div class="row"><div><b>${esc(p.name)}</b>${p.is_demo ? " <span class='tag' style='position:static'>demo</span>" : ""}<span class="meta">${p.type} · ${m(p.sale_price)}${p.is_on_sale ? ` (was ${m(p.original_price)}, ${p.discount_percentage}% off)` : ""} · ${p.is_published ? "Published" : "Draft"}</span></div><div><button class="btn sm ghost" data-pf="${p.id}">Edit</button> <button class="btn sm ghost" data-pub="${p.id}" data-v="${p.is_published}">${p.is_published ? "Unpublish" : "Publish"}</button> <button class="btn sm ghost" data-del="${p.id}">Delete</button></div></div>`).join("") || "<p class='empty'>No products yet.</p>"}`;
}
function productForm(id) {
  const p = (window._prods || []).find(x => x.id == id) || { type: "ebook", flow_steps: [], learn_points: [], included: [] };
  const f = (k, l, v, t = "text") => `<label>${l}</label><input class="f" data-k="${k}" type="${t}" value="${esc(v ?? "")}">`;
  $("#panel").innerHTML = `<div class="ph"><h2>${id ? "Edit" : "New"} product</h2><button class="ib" data-close aria-label="Close">✕</button></div>${f("name", "Name", p.name)}${f("slug", "URL slug (letters, numbers, hyphens)", p.slug)}<label>Type</label><select class="f" data-k="type">${["ebook", "course", "bundle", "resource"].map(t => `<option ${p.type == t ? "selected" : ""}>${t}</option>`).join("")}</select><label>Category</label><select class="f" data-k="category_id">${window._cats.map(c => `<option value="${c.id}" ${p.category_id == c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>${f("original_price", "Original price (optional)", p.original_price, "number")}${f("sale_price", "Selling price", p.sale_price, "number")}<p class="note">The discount percentage is calculated automatically.</p>${f("short_description", "Short description", p.short_description)}<label>Full description</label><textarea class="f" data-k="description">${esc(p.description)}</textarea>${f("flow", "Illustration steps, separated by commas (e.g. Prompt, AI scene, Video)", (p.flow_steps || []).join(", "))}<label>What the customer will learn (one per line)</label><textarea class="f" data-k="learn">${esc((p.learn_points || []).join("\n"))}</textarea><label>What is included (one per line)</label><textarea class="f" data-k="incl">${esc((p.included || []).join("\n"))}</textarea>${f("requirements", "Requirements", p.requirements)}<label>Cover image (optional, up to 2 MB)</label><input class="f" id="cv" type="file" accept="image/png,image/jpeg,image/webp"><label>Product file (private; PDF, ZIP, etc.)</label><input class="f" id="pf" type="file"><label class="lesson"><input type="checkbox" data-k="is_published" ${p.is_published ? "checked" : ""}> Published</label><label class="lesson"><input type="checkbox" data-k="is_demo" ${p.is_demo ? "checked" : ""}> Demo product</label><div class="err" id="pe"></div><button class="btn" style="width:100%;margin-top:12px" data-save="${id || ""}">Save product</button>`;
  $("#sheet").classList.add("on");
}
async function saveProduct(id) {
  const g = k => document.querySelector(`[data-k="${k}"]`), v = k => g(k).type == "checkbox" ? g(k).checked : g(k).value.trim(), lines = k => v(k).split("\n").map(s => s.trim()).filter(Boolean), pe = $("#pe");
  const row = { name: v("name"), slug: v("slug"), type: v("type"), category_id: +v("category_id"), original_price: v("original_price") === "" ? null : +v("original_price"), sale_price: +v("sale_price"), short_description: v("short_description"), description: v("description"), flow_steps: v("flow").split(",").map(s => s.trim()).filter(Boolean), learn_points: lines("learn"), included: lines("incl"), requirements: v("requirements"), is_published: v("is_published"), is_demo: v("is_demo"), updated_at: new Date().toISOString() };
  if (!row.name || !/^[a-z0-9-]+$/.test(row.slug) || !(row.sale_price >= 0)) return pe.textContent = "Enter a name, a valid slug and a selling price.";
  const cv = $("#cv").files[0], pf = $("#pf").files[0];
  if (cv && cv.size > 2097152) return pe.textContent = "Cover must be under 2 MB.";
  if (cv) { const path = `${row.slug}-${Date.now()}.${cv.name.split(".").pop()}`; const u = await sb.storage.from("covers").upload(path, cv); if (u.error) return pe.textContent = "Cover upload failed."; row.cover_path = path }
  const r = id ? await sb.from("products").update(row).eq("id", id).select().single() : await sb.from("products").insert(row).select().single();
  if (r.error) return pe.textContent = "Could not save: " + r.error.message;
  if (pf) { const path = `${row.slug}/${Date.now()}-${pf.name.replace(/[^\w.-]/g, "_")}`; const u = await sb.storage.from("product-files").upload(path, pf); if (u.error) return pe.textContent = "Saved, but file upload failed: " + u.error.message;
    await sb.from("digital_products").delete().eq("product_id", r.data.id); await sb.from("digital_products").insert({ product_id: r.data.id, file_name: pf.name, storage_path: path }) }
  if (row.type == "course") await sb.from("courses").upsert({ product_id: r.data.id });
  $("#sheet").classList.remove("on"); toast("Saved"); tab("products");
}

async function settings() {
  const { data } = await sb.from("site_settings").select("*").order("key");
  $("#view").innerHTML = data.map(s => `<label for="s-${s.key}">${s.key.replace(/_/g, " ")}</label><input class="f" id="s-${s.key}" data-s="${s.key}" value="${esc(s.value)}">`).join("") + `<p class="note">Payment number and instructions shown at checkout come from here.</p><button class="btn" style="margin-top:12px" data-savesettings>Save settings</button>`;
}

document.addEventListener("click", async ev => {
  const t = ev.target.closest("button,.sheet"), D = t?.dataset; if (!t) return;
  if (D.t) tab(D.t); else if (D.o) orderDetail(D.o); else if (D.ap) review(D.ap, true); else if (D.rj) review(D.rj, false); else if (D.rv) revoke(D.rv);
  else if (D.pf !== undefined) productForm(D.pf); else if (D.save !== undefined) saveProduct(D.save);
  else if (D.pub) { await sb.from("products").update({ is_published: D.v != "true" }).eq("id", D.pub); tab("products") }
  else if (D.del) { if (confirm("Delete this product permanently? Customers who bought it lose library access to it.")) { const { error } = await sb.from("products").delete().eq("id", D.del); toast(error ? "Cannot delete a product that has orders. Unpublish it instead." : "Deleted"); tab("products") } }
  else if (D.savesettings !== undefined) { const rows = [...document.querySelectorAll("[data-s]")].map(i => ({ key: i.dataset.s, value: i.value })); const r = await Promise.all(rows.map(x => sb.from("site_settings").update({ value: x.value }).eq("key", x.key))); toast(r.some(x => x.error) ? "Some settings failed" : "Settings saved") }
  else if (D.close !== undefined || (t.id == "sheet" && ev.target == t)) $("#sheet").classList.remove("on");
  else if (t.id == "go") { const { error } = await sb.auth.signInWithPassword({ email: $("#em").value.trim(), password: $("#pw").value }); if (error) $("#le").textContent = error.message; else boot() }
  else if (t.id == "out") { await sb.auth.signOut(); location.reload() }
});
document.addEventListener("change", ev => { if (ev.target.id == "os") { OF.status = ev.target.value; orders() } });
document.addEventListener("keydown", ev => { if (ev.key == "Enter" && ev.target.id == "oq") { OF.q = ev.target.value.trim(); orders() } });
boot();
