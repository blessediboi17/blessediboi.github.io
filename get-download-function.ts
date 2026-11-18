// Deploy: supabase functions deploy get-download
// Verifies the caller owns the product, then returns a 60-second signed URL from private storage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization") ?? "";
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user: u } } = await user.auth.getUser();
  if (!u) return new Response(JSON.stringify({ error: "Sign in required" }), { status: 401, headers: cors });
  const { productId } = await req.json();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: own } = await admin.from("customer_library").select("revoked").eq("user_id", u.id).eq("product_id", productId).maybeSingle();
  if (!own || own.revoked) return new Response(JSON.stringify({ error: "No access to this product" }), { status: 403, headers: cors });
  const { data: f } = await admin.from("digital_products").select("storage_path").eq("product_id", productId).limit(1).single();
  if (!f?.storage_path) return new Response(JSON.stringify({ error: "File not available yet" }), { status: 404, headers: cors });
  const { data: s } = await admin.storage.from("product-files").createSignedUrl(f.storage_path, 60);
  await admin.from("download_logs").insert({ user_id: u.id, product_id: productId });
  return new Response(JSON.stringify({ url: s?.signedUrl }), { headers: { ...cors, "Content-Type": "application/json" } });
});
