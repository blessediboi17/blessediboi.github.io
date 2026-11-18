// Blessed Digital Store: storefront logic. Talks to Supabase; prices and approvals are enforced in SQL, not here.
const sb = supabase.createClient(CFG.url, CFG.key);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
const ld = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f } catch { return f } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} };
let P = [], CATS = ["All"], S = {}, cat = "All", qs = "";
const money = n => (S.currency_symbol || "$") + Number(n).toFixed(2);
const toast = m => { const t = document.createElement("div"); t.className = "toast"; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500) };
const ICO = { ok: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>', x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>' };

// ---------- illustrations ----------
function cover(p) {
  if (p.cover_path) return `<img src="${sb.storage.from("covers").getPublicUrl(p.cover_path).data.publicUrl}" alt="${esc(p.name)} cover" width="112" loading="lazy" style="border-radius:4px">`;
  const words = p.name.toUpperCase().split(" "), lines = [""]; 
  words.forEach(w => { const l = lines[lines.length - 1]; if ((l + " " + w).trim().length > 10 && l) lines.push(w); else lines[lines.length - 1] = (l + " " + w).trim() });
  const t = lines.slice(0, 4).map((l, i) => `<text x="14" y="${64 + i * 18}" fill="#fff" font-family="Georgia,serif" font-weight="700" font-size="13">${esc(l)}</text>`).join("");
  return `<svg viewBox="0 0 120 160" role="img" aria-label="${esc(p.name)} cover"><rect width="120" height="160" rx="4" fill="#0B1F3A"/><rect width="8" height="160" fill="#2563EB"/><rect x="14" y="16" width="26" height="3" fill="#5B8DEF"/>${t}<path d="M14 132h92M14 140h60" stroke="#5B8DEF" stroke-width="2" opacity=".6"/><text x="14" y="153" fill="#9AA7BF" font-size="7" font-family="system-ui">Blessed Studios</text></svg>`;
}
function flow(p) {
  const st = p.flow_steps || []; if (!st.length) return "";
  const n = st.length, g = 16, w = (360 - (n - 1) * g) / n;
  const b = st.map((s, i) => { const x = i * (w + g), last = i == n - 1;
    return `<rect x="${x}" y="22" width="${w}" height="44" rx="6" fill="${last ? "#2563EB" : "#fff"}" stroke="#16325C" stroke-width="1.2"/><text x="${x + w / 2}" y="48" text-anchor="middle" font-size="${n > 4 ? 8.5 : 10}" font-weight="600" fill="${last ? "#fff" : "#0B1F3A"}" font-family="system-ui,sans-serif">${esc(s)}</text>` + (last ? "" : `<path d="M${x + w + 3} 44h${g - 8}m-4-4l4 4-4 4" stroke="#16325C" stroke-width="1.4" fill="none"/>`) }).join("");
  return `<div class="flowbox"><svg viewBox="0 0 360 86" role="img" aria-label="${esc(st.join(" to "))}"><text x="0" y="12" font-size="9" fill="#5B667A" font-family="system-ui,sans-serif">How it works</text>${b}</svg></div>`;
}

// ---------- catalog ----------
async function init() {
  const [a, b, c] = await Promise.all([
    sb.from("products").select("*,categories(name)").eq("is_published", true).order("created_at"),
    sb.from("categories").select("name").order("id"),
    sb.from("site_settings").select("key,value").eq("is_public", true)]).catch(() => [{ error: 1 }]);
  if (a.error) { const c0 = ld("bds_catalog", null); if (c0) { ({ P, CATS, S } = c0); toast("Offline: showing saved catalog") } else $("#grid").innerHTML = `<div class="empty" style="grid-column:1/-1">Could not load products. Check your connection.<br><button class="btn sm" style="margin-top:10px" onclick="init()">Retry</button></div>` }
  else { P = a.data; CATS = ["All", ...b.data.map(x => x.name)]; (c.data || []).forEach(r => S[r.key] = r.value); sv("bds_catalog", { P, CATS, S }) }
  $("#support").textContent = S.support_contact || "Contact details are set in admin settings.";
  drawChips(); drawGrid(); drawResume();
}
const catOk = p => cat == "All" || p.categories?.name == cat || (cat == "eBooks" && p.type == "ebook") || (cat == "Bundles" && p.type == "bundle") || (cat == "Free Resources" && +p.sale_price == 0);
function drawChips() { $("#chips").innerHTML = CATS.map(c => `<button class="chip" aria-pressed="${c == cat}" data-c="${esc(c)}">${esc(c)}</button>`).join("") }
function drawGrid() {
  const q = qs.trim().toLowerCase(), l = P.filter(p => catOk(p) && (!q || [p.name, p.short_description, p.categories?.name, p.type].join(" ").toLowerCase().includes(q)));
  $("#grid").innerHTML = l.length ? l.map(p => `<article class="card"><div class="cover">${cover(p)}<span class="tag">${p.type}${p.is_demo ? " · demo" : ""}</span>${p.discount_percentage ? `<span class="off">${p.discount_percentage}% OFF</span>` : ""}</div><div class="cb"><span class="meta">${esc(p.categories?.name || "")}</span><h3>${esc(p.name)}</h3><p>${esc(p.short_description)}</p><div class="price"><b>${money(p.sale_price)}</b>${p.is_on_sale ? `<s>${money(p.original_price)}</s>` : ""}</div><div class="acts"><button class="btn" data-buy="${p.id}">Buy Now</button><button class="btn ghost" data-view="${p.id}">Details</button></div></div></article>`).join("") : `<div class="empty" style="grid-column:1/-1">No products match. Try another word or choose All.</div>`;
}
const open_ = h => { $("#panel").innerHTML = h; $("#sheet").classList.add("on"); document.body.style.overflow = "hidden" };
const close_ = () => { $("#sheet").classList.remove("on"); document.body.style.overflow = ""; drawResume() };
const head = t => `<div class="ph"><h2>${t}</h2><button class="ib" data-close aria-label="Close">${ICO.x}</button></div>`;
const list = a => `<ul class="chk">${(a || []).map(x => `<li>${ICO.ok}${esc(x)}</li>`).join("")}</ul>`;
async function view(id) {
  const p = P.find(x => x.id == id); if (!p) return;
  open_(head(esc(p.name)) + `<div class="cover" style="border-radius:10px;margin-bottom:12px">${cover(p)}</div>${flow(p)}<div class="price" style="margin:14px 0"><b style="font-size:26px">${money(p.sale_price)}</b>${p.is_on_sale ? `<s>${money(p.original_price)}</s><span class="off" style="position:static">${p.discount_percentage}% OFF</span>` : ""}</div><p>${esc(p.description || p.short_description)}</p>${p.learn_points?.length ? "<h3>What you will learn</h3>" + list(p.learn_points) : ""}${p.included?.length ? "<h3>What is included</h3>" + list(p.included) : ""}<div id="les"></div>${p.requirements ? `<p class="meta"><b>Requirements:</b> ${esc(p.requirements)}</p>` : ""}<button class="btn" style="width:100%" data-buy="${p.id}">Buy Now</button><p class="meta" style="margin-top:14px">Related: ${P.filter(x => x.id != p.id && x.categories?.name == p.categories?.name || x.id != p.id).slice(0, 2).map(x => `<button class="chip" data-view="${x.id}">${esc(x.name)}</button>`).join(" ")}</p>`);
  if (p.type == "course") { const { data } = await sb.from("course_lessons").select("title,position").eq("course_id", p.id).order("position"); /* titles only visible to owners/admin by RLS */ if (data?.length) $("#les").innerHTML = "<h3>Course lessons</h3><ol>" + data.map(l => `<li>${esc(l.title)}</li>`).join("") + "</ol>" }
}

// ---------- persistent checkout ----------
const DK = "bds_draft";
function drawResume() {
  const d = ld(DK, null), el = $("#resume"), p = d && P.find(x => x.id == d.pid);
  el.innerHTML = p ? `<div class="banner"><div><b>Welcome back. You have an unfinished purchase.</b><br><span class="meta">${esc(p.name)}${d.order ? ` · Order <span class="ordno">${esc(d.order)}</span>` : ""}</span></div><button class="btn sm" data-resume>Resume Checkout</button><button class="btn sm ghost" data-discard>Discard</button></div>` : "";
}
function buy(id) { let d = ld(DK, null); if (!d || d.pid != id) { d = { pid: id, name: "", phone: "", email: "", txn: "", order: null }; sv(DK, d) } checkout() }
function checkout() {
  const d = ld(DK, null), p = d && P.find(x => x.id == d.pid); if (!p) return;
  const person = `<label for="n">Full name</label><input class="f" id="n" autocomplete="name" value="${esc(d.name)}" data-f="name"><label for="ph">Phone number</label><input class="f" id="ph" type="tel" autocomplete="tel" value="${esc(d.phone)}" data-f="phone"><label for="em">Email <small>(optional)</small></label><input class="f" id="em" type="email" autocomplete="email" value="${esc(d.email)}" data-f="email">`;
  const sum = `<div class="pay"><dl><dt>Product</dt><dd>${esc(p.name)}</dd>${d.order ? `<dt>Order number</dt><dd><span class="ordno">${esc(d.order)}</span></dd>` : ""}<dt>Amount payable</dt><dd style="font-size:20px">${money(p.sale_price)}</dd></dl></div>`;
  if (!d.order) return open_(head("Checkout") + sum + person + `<div class="err" id="er" role="alert"></div><button class="btn" style="width:100%;margin-top:14px" data-order>Continue to payment</button><p class="note">Your progress saves on this device as you type.</p>`);
  open_(head("Pay and confirm") + sum + `<h3>Pay with ${esc(S.payment_method || "Mobile Money")}</h3><div class="pay"><dl><dt>Send to</dt><dd>${esc(S.payment_recipient)}</dd><dt>Number</dt><dd>${esc(S.payment_number || "Ask support")}</dd><dt>Amount</dt><dd>${money(p.sale_price)}</dd></dl><p class="note" style="margin:10px 0 0">${esc(S.payment_instructions)} Include your order number in the payment note if you can.</p></div>
<label for="tx">Transaction ID <small>(if you have it)</small></label><input class="f" id="tx" value="${esc(d.txn)}" data-f="txn"><label for="sc">Payment screenshot <small>(optional, JPG or PNG, up to 5 MB)</small></label><input class="f" id="sc" type="file" accept="image/jpeg,image/png"><div class="err" id="er" role="alert"></div><button class="btn" style="width:100%;margin-top:14px" data-submit>I have paid, confirm</button><p class="note">Access is granted only after the store owner verifies your payment.</p>`);
}
async function makeOrder() {
  const d = ld(DK, null), er = $("#er");
  if (d.name.trim().length < 2) return er.textContent = "Enter your full name.";
  if (d.phone.replace(/\D/g, "").length < 7) return er.textContent = "Enter a valid phone number.";
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) return er.textContent = "That email address looks wrong.";
  if (!navigator.onLine) return er.textContent = "You are offline. Your details are saved. Reconnect to continue.";
  er.textContent = "";
  const { data, error } = await sb.rpc("create_order", { p_product: d.pid, p_name: d.name, p_phone: d.phone, p_email: d.email || null });
  if (error) return er.textContent = "Could not create the order. Try again.";
  d.order = data; sv(DK, d); checkout();
}
async function submitPay() {
  const d = ld(DK, null), er = $("#er"), f = $("#sc").files[0];
  if (f && (!/^image\/(jpeg|png)$/.test(f.type) || f.size > 5e6)) return er.textContent = "Screenshot must be a JPG or PNG under 5 MB.";
  if (!d.txn.trim() && !f) return er.textContent = "Add a transaction ID or a screenshot so we can find your payment.";
  if (!navigator.onLine) return er.textContent = "You are offline. Your progress is saved. Reconnect and tap confirm again.";
  er.textContent = "Sending…";
  let path = null;
  if (f) { path = `incoming/${d.order}-${Date.now()}.${f.type == "image/png" ? "png" : "jpg"}`; const u = await sb.storage.from("payment-screenshots").upload(path, f, { contentType: f.type }); if (u.error) return er.textContent = "Screenshot upload failed. Try again or remove it." }
  const { error } = await sb.rpc("submit_payment", { p_order: d.order, p_phone: d.phone, p_txn: d.txn || null, p_screenshot: path });
  if (error) return er.textContent = error.message.includes("already") ? "This order was already submitted." : "Could not send. Your progress is saved. Try again.";
  localStorage.removeItem(DK);
  open_(head("Payment submitted") + `<p>Thank you. Order <span class="ordno">${esc(d.order)}</span> is waiting for review.</p><p>You get access after the store owner approves your payment. Keep your order number.</p><button class="btn" data-track="${esc(d.order)}">Track this order</button>`);
}

// ---------- tracking ----------
const LABEL = { awaiting_payment: ["Awaiting Payment", "Send the Mobile Money payment, then confirm it."], submitted: ["Payment Submitted", "We received your confirmation. It is waiting for review."], under_review: ["Payment Under Review", "The store owner is checking your payment."], approved: ["Payment Approved", "Your payment is verified. Sign in to find the product in your library."], rejected: ["Payment Rejected", "Your payment could not be verified. Read the reason, then resubmit."] };
function track(pre) { open_(head("Track your order") + `<label for="to">Order number</label><input class="f" id="to" value="${esc(pre || "")}" placeholder="BDS-123456"><label for="tp">Phone number used at checkout</label><input class="f" id="tp" type="tel"><button class="btn" style="width:100%;margin-top:14px" data-lookup>Check status</button><div id="tr" role="status" style="margin-top:14px"></div>`) }
async function lookup() {
  const { data, error } = await sb.rpc("track_order", { p_order: $("#to").value, p_phone: $("#tp").value }), o = data?.[0];
  $("#tr").innerHTML = error ? `<div class="err">Could not check right now. Try again.</div>` : o ? `<div class="pay"><span class="st">${LABEL[o.status][0]}</span><p style="margin:8px 0 0">${LABEL[o.status][1]}</p>${o.rejection_reason ? `<p><b>Reason:</b> ${esc(o.rejection_reason)}</p><button class="btn sm" data-resubmit="${esc(o.order_number)}">Resubmit payment</button>` : ""}</div>` : `<div class="err">No order found. Check the number and the phone.</div>`;
}
function resubmit(num) { const d = ld(DK, null) || {}; sv(DK, { ...d, order: num, phone: $("#tp").value, pid: d.pid || (P[0] && P[0].id), txn: "" }); checkout() }

// ---------- account and library ----------
async function account() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return open_(head("Sign in") + `<label for="an">Full name <small>(new accounts)</small></label><input class="f" id="an"><label for="ae">Email</label><input class="f" id="ae" type="email" autocomplete="username"><label for="ap">Password <small>(8+ characters)</small></label><input class="f" id="ap" type="password" autocomplete="current-password"><div class="err" id="er" role="alert"></div><div class="acts" style="margin-top:14px"><button class="btn" data-signin>Sign in</button><button class="btn ghost" data-signup>Create account</button></div>`);
  const [lib, nt] = await Promise.all([sb.from("customer_library").select("product_id,revoked,products(id,name,type)").eq("revoked", false), sb.from("notifications").select("title,body,created_at").order("created_at", { ascending: false }).limit(5)]);
  open_(head("My library") + `<p class="meta">${esc(session.user.email)}</p>${nt.data?.length ? "<h3>Notifications</h3>" + nt.data.map(n => `<p class="note"><b>${esc(n.title)}</b>${n.body ? " · " + esc(n.body) : ""}</p>`).join("") : ""}<h3 style="margin-top:14px">My purchases</h3>${lib.data?.length ? lib.data.map(l => `<div class="row"><div><b>${esc(l.products.name)}</b><span class="meta">${l.products.type}</span></div>${l.products.type == "course" ? `<button class="btn sm" data-lessons="${l.products.id}">Resume Course</button>` : `<button class="btn sm" data-dl="${l.products.id}">Download</button>`}</div><div id="ls-${l.products.id}"></div>`).join("") : `<p class="empty">Nothing here yet. Approved purchases appear here.</p>`}<h3>Link earlier orders</h3><p class="note">Bought without an account? Enter the phone number you used at checkout.</p><input class="f" id="cp" type="tel" placeholder="Phone number"><button class="btn sm" style="margin-top:8px" data-claim>Link my orders</button><div style="margin-top:18px"><button class="btn ghost sm" data-signout>Sign out</button></div>`);
}
async function auth(up) {
  const email = $("#ae").value.trim(), password = $("#ap").value, er = $("#er");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return er.textContent = "Enter a valid email and a password of 8+ characters.";
  const r = up ? await sb.auth.signUp({ email, password, options: { data: { full_name: $("#an").value } } }) : await sb.auth.signInWithPassword({ email, password });
  if (r.error) return er.textContent = r.error.message;
  if (up && !r.data.session) return er.textContent = "Check your email to confirm your account, then sign in.";
  account();
}
async function lessons(cid) {
  const [l, pr] = await Promise.all([sb.from("course_lessons").select("id,title,video_url,content").eq("course_id", cid).order("position"), sb.from("lesson_progress").select("lesson_id")]);
  const done = new Set((pr.data || []).map(x => x.lesson_id));
  $("#ls-" + cid).innerHTML = `<p class="note">${done.size} of ${l.data.length} lessons complete</p>` + l.data.map(x => `<div class="lesson"><label style="flex:1"><input type="checkbox" data-les="${x.id}" data-c="${cid}" ${done.has(x.id) ? "checked" : ""}> ${esc(x.title)}</label>${/^https:\/\//.test(x.video_url || "") ? `<a class="btn sm" href="${esc(x.video_url)}" target="_blank" rel="noopener">Watch</a>` : ""}</div>${x.content ? `<p class="note">${esc(x.content)}</p>` : ""}`).join("");
}
async function download(pid) {
  const { data, error } = await sb.functions.invoke("get-download", { body: { productId: pid } });
  if (data?.url) window.open(data.url, "_blank"); else toast(error ? "Download not available. Try again." : data?.error || "Download not available.");
}

// ---------- events ----------
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button,.sheet"), D = t?.dataset; if (!t) return;
  if (D.c) { cat = D.c; drawChips(); drawGrid() } else if (D.buy) buy(D.buy); else if (D.view) view(D.view);
  else if (D.resume !== undefined) checkout(); else if (D.discard !== undefined) { if (confirm("Discard this unfinished purchase? Your order stays on file if you already created it.")) { localStorage.removeItem(DK); drawResume() } }
  else if (D.order !== undefined) makeOrder(); else if (D.submit !== undefined) submitPay();
  else if (D.track !== undefined || t.id == "track") track(D.track); else if (D.lookup !== undefined) lookup(); else if (D.resubmit) resubmit(D.resubmit);
  else if (t.id == "acct") account(); else if (D.signin !== undefined) auth(false); else if (D.signup !== undefined) auth(true);
  else if (D.signout !== undefined) { await sb.auth.signOut(); close_() }
  else if (D.lessons) lessons(D.lessons); else if (D.dl) download(D.dl);
  else if (D.claim !== undefined) { const { data, error } = await sb.rpc("claim_orders", { p_phone: $("#cp").value }); toast(error ? "Could not link orders." : `Linked ${data} order(s).`); account() }
  else if (D.close !== undefined || (t.id == "sheet" && ev.target == t)) close_();
});
document.addEventListener("input", ev => { const k = ev.target.dataset.f; if (k) { const d = ld(DK, null); if (d) { d[k] = ev.target.value; sv(DK, d) } } if (ev.target.id == "q") { qs = ev.target.value; drawGrid() } });
document.addEventListener("change", async ev => { const el = ev.target; if (!el.dataset.les) return; const { data: { user } } = await sb.auth.getUser();
  if (el.checked) await sb.from("lesson_progress").upsert({ user_id: user.id, lesson_id: el.dataset.les }); else await sb.from("lesson_progress").delete().eq("lesson_id", el.dataset.les).eq("user_id", user.id); lessons(el.dataset.c) });
document.addEventListener("keydown", ev => { if (ev.key == "Escape") close_() });
window.addEventListener("offline", () => toast("You are offline. Saved progress is kept."));

// ---------- PWA install ----------
const instOff = () => Date.now() - ld("bds_inst_no", 0) < 2592e5;
let dp; const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); dp = ev; $("#install").hidden = false; $("#instgo").hidden = false; $("#insttxt").textContent = "Get faster access to your eBooks, courses, and digital resources."; if (!instOff()) setTimeout(() => { if (dp) $("#instbar").hidden = false }, 3000) });
$("#instgo").onclick = async () => { if (dp) { dp.prompt(); await dp.userChoice; dp = null } $("#instbar").hidden = true };
$("#instno").onclick = () => { sv("bds_inst_no", Date.now()); $("#instbar").hidden = true };
$("#install").onclick = () => { if (dp) dp.prompt(); else toast("In your browser menu, choose Install app or Add to Home screen.") };
if (ios && !standalone && !instOff()) { $("#insttxt").textContent = "On iPhone: tap Share, then Add to Home Screen."; $("#instgo").hidden = true; $("#instbar").hidden = false }
if (!ios && !standalone) setTimeout(() => { if (!dp && !instOff()) { $("#insttxt").textContent = "Open your browser menu and choose Install app or Add to Home screen."; $("#instgo").hidden = true; $("#instbar").hidden = false } }, 8000);
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js"));
init();
