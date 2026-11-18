# Blessed Digital Store (plain HTML, CSS, JS)

Static site, no build step. Supabase is the backend. Host on GitHub Pages, Vercel or Netlify.

## Files
index.html, style.css, app.js (storefront) | admin.html, admin.js (admin at /admin.html) | config.js (your Supabase URL and anon key)
sw.js, manifest.json, offline.html, icons/ (PWA) | schema.sql (database) | get-download-function.ts (protected downloads)

## Setup
1. Create a Supabase project. SQL editor: paste and run `schema.sql` (the last block is demo data; delete it before launch).
2. Edit `config.js` with your project URL and anon key. Never use the service-role key here.
3. Auth: enable the Email provider. Sign up through the storefront Account button, then make yourself admin:
   `update profiles set role = 'admin' where id = (select id from auth.users where email = 'YOU@EXAMPLE.COM');`
4. Open `/admin.html`, sign in, go to Settings, and set `payment_number` (your Orange Money number), support contact and instructions.
5. Protected downloads: install the Supabase CLI, create `supabase/functions/get-download/index.ts` from `get-download-function.ts`, run `supabase functions deploy get-download`. Upload files via Admin, Products, Product file.
6. Deploy: push the files to GitHub and enable Pages, or import into Vercel. The site must be served over HTTPS for the PWA to install.

## Notes
- Prices, approvals and access are enforced by SQL (RLS and functions), not by this JavaScript.
- Google Drive is not connected; files use private Supabase Storage with 60-second signed links. A signed link cannot stop a customer from sharing a file they downloaded.
- Not yet built: admin lesson editor (add rows to `course_lessons` in the Supabase table editor for now), customer management screen, email notifications, phone OTP recovery. Order recovery uses order number plus phone.
- Replace the generated icons in `icons/` with your real logo when ready.
