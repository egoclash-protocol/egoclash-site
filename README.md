# EGOCLASH ($EGOC) website

Static, dependency-free site for EGOCLASH ($EGOC), a satirical sitcom on Solana.
Everything is in this folder: `index.html` plus `assets/` (CSS, JS, fonts, images).
There is no build step.

- X: https://x.com/EgoClash_EGOC
- Telegram community: https://t.me/EgoClashCommunity
- Contract address: `BrfMCtwXY7tLvgmPD2wFk55ckvFms2MVNrzu1yZBpump`

Satire and entertainment. Not financial advice.

## Run locally

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy (Render static site)

- Publish directory: `.`
- Build command: none
- Auto-deploy: on every push to `main`
- `render.yaml` holds the static site definition and cache/security headers (used when the site is created from a Blueprint).

## Custom domain

In the Render dashboard open the static site, then Settings > Custom Domains > Add, and enter the domain.
Add the DNS record Render shows (a CNAME to the `onrender.com` address for a subdomain, or the A/ALIAS record for the apex domain).
TLS is issued automatically. Afterwards update `canonical`, `og:image` and `twitter:image` in `index.html` to the new domain.

## Notes

- The home page is a 3D room drawn with a small hand-written WebGL2 renderer (`assets/room.js`). There are no libraries and no build step.
- Without WebGL2 the same content shows as a normal scrolling page.
- Files: `assets/data.js` (config, cast, scripted lines), `assets/room.js` (the room), `assets/app.js` (panels, live data, quote maker, sound).
- The four screens, the dispute board and the cat are scripted fiction: edit `LORE`, `MOOD` and `DISPUTES` in `assets/data.js`. Only Marvin quotes the real 24h change.
- Live market numbers come from the public DexScreener API in the browser; nothing is hardcoded.
- Top posts are a manual pick (`#p-posts` in `index.html`), last ranked by X view count on 12 Nov 2026.
- Discord link: set `DISCORD_URL` at the top of `assets/data.js` to show the Discord buttons.
- Easter egg: type `FEED ME A STRAY CAT` anywhere.
