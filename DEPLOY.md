# Deploying pdfedits.tech

The site is built with Vite + React, deployed to GitHub Pages via Actions,
and served on `pdfedits.tech` via a CNAME file + DNS records you set at
your domain registrar.

## What ships

- Landing page at `/` (HashRouter root)
- PDF editor at `/#/editor`
- All assets in `dist/` after `npm run build`
- `public/CNAME` → published to the root of `dist/` so GitHub Pages
  recognizes the custom domain

## GitHub Pages settings

1. Repo: <https://github.com/apointandaline/pdfeditor.tech>
2. Settings → Pages → **Source: GitHub Actions** (the deploy workflow will
   show up after first push)
3. Custom domain: `pdfedits.tech` — GitHub auto-detects from the CNAME
   file in your build artifact. Once DNS is verified, check **Enforce HTTPS**.

## DNS records (set at your domain registrar)

Apex (`pdfedits.tech`) — four **A** records pointing at GitHub Pages IPs:

| Type | Name | Value             |
|------|------|-------------------|
| A    | @    | `185.199.108.153` |
| A    | @    | `185.199.109.153` |
| A    | @    | `185.199.110.153` |
| A    | @    | `185.199.111.153` |

Optional `www` subdomain — one **CNAME**:

| Type  | Name | Value                       |
|-------|------|-----------------------------|
| CNAME | www  | `apointandaline.github.io.` |

(Trailing dot may not be required by your registrar.)

If your registrar also supports `AAAA` records (IPv6), you can add:

| Type | Name | Value                            |
|------|------|----------------------------------|
| AAAA | @    | `2606:50c0:8000::153`            |
| AAAA | @    | `2606:50c0:8001::153`            |
| AAAA | @    | `2606:50c0:8002::153`            |
| AAAA | @    | `2606:50c0:8003::153`            |

These are the official GitHub Pages IPs documented at
<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>.

## Verifying

After the DNS records propagate (usually minutes; up to ~24h for the
first time):

```bash
# Should return one of the GitHub Pages IPs above
dig +short pdfedits.tech

# Should reach the site and serve HTML (not a registrar parking page)
curl -I https://pdfedits.tech
```

GitHub's Pages settings page will also light up green once it verifies
the DNS + serves a successful HTTPS handshake. Then click **Enforce HTTPS**.

## Local build / preview

```bash
npm install
npm run dev         # http://localhost:5173
npm run build       # writes dist/
npm run preview     # serves dist/ at http://localhost:4173
```

## Future polish

- **Code splitting**: the editor route ships pdfjs + pdf-lib (~1.8 MB JS).
  A lazy `import()` on the `EditorPage` would let the landing load
  instantly. See `vite.config.ts` `build.rollupOptions.output.manualChunks`.
- **Open Graph image** for link previews.
- **Sitemap + robots.txt**.
