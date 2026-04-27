# NetCheck-BFF

> **High-performance diagnostic proxy for the [NetCheck](https://github.com/aym3nb/NetCheck) dashboard.**

A lightweight Backend-for-Frontend (BFF) built on **Cloudflare Workers** and **Hono** that resolves browser CORS limitations and provides high-fidelity network diagnostics — including NextDNS connectivity checks and rich geolocation/ASN metadata — from the edge.

---

## Architecture

```
[Client Browser]
      │
      │  fetch("/nextdns") or fetch("/ip-info")
      ▼
[Cloudflare Worker – netcheck-bff]   ← X-NetCheck-Edge: CDG
      │
      ├──► GET https://test.nextdns.io/   (server-to-server, no CORS)
      │
      └──► cf IncomingRequestCfProperties (Cloudflare edge metadata)
```

Because all upstream calls happen inside the Worker, the browser is never subject to cross-origin restrictions.

---

## API Reference

### `GET /nextdns`

Proxies a request to `https://test.nextdns.io/` and returns the JSON payload.

**Success response – `200 OK`**

```json
{
  "status": "ok",
  "protocol": "DNS-over-HTTPS",
  "profile": "abc123",
  "server": "fra-1"
}
```

**Error response – `502 Bad Gateway`**

```json
{
  "error": "upstream_timeout",
  "message": "The request to test.nextdns.io timed out after 10 s",
  "timestamp": "2026-04-27T08:00:00.000Z"
}
```

---

### `GET /ip-info`

Returns geolocation and network metadata derived from Cloudflare's `cf` object attached to every inbound request.  All fields fall back to `null` when the data is unavailable.

The response keys are intentionally compatible with the NetCheck frontend's `IpInfo` interface (previously sourced from `ipapi.co`), so the UI works without modifications.

> **Note**: `country_name` contains the ISO-3166 alpha-2 code (e.g. `"FR"`) because Cloudflare's edge metadata does not include full country names.

**Success response – `200 OK`**

```json
{
  "ip": "203.0.113.42",
  "isp": "Example ISP",
  "org": "Example ISP",
  "city": "Paris",
  "region": "Île-de-France",
  "country_name": "FR",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "timezone": "Europe/Paris",
  "country": "FR",
  "continent": "EU",
  "asn": 12345,
  "asOrganization": "Example ISP",
  "timestamp": "2026-04-27T08:00:00.000Z"
}
```

**Response headers**

| Header | Example | Description |
|---|---|---|
| `X-NetCheck-Edge` | `CDG` | Cloudflare PoP IATA code that served the request |

---

### `GET /`

Health-check endpoint.

**Response – `200 OK`**

```json
{ "status": "ok", "service": "netcheck-bff", "timestamp": "2026-04-27T08:00:00.000Z" }
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (Node.js compat) |
| Framework | [Hono](https://hono.dev/) v4+ |
| Language | TypeScript (strict) |
| Deployment | [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI |

---

## Security

### Strict CORS Origin Pinning

CORS is restricted to a fixed allowlist to prevent third parties from using this Worker as a free proxy and consuming your Cloudflare request quota:

```ts
// src/index.ts
const ALLOWED_ORIGINS = [
  "https://aym3nb.github.io", // production (GitHub Pages)
  "http://localhost:5173",    // Vite dev server
  "http://localhost:4173",    // Vite preview server
];
```

To add more origins, extend this array and redeploy.

---

## Local Development

```bash
# Install dependencies
npm install

# Start local dev server (powered by Miniflare)
npm run dev
```

The Worker will be available at `http://localhost:8787`.

### Frontend integration

In the NetCheck frontend repository, create a `.env.local` file (gitignored) that points to this Worker:

```env
# .env.local  (NetCheck frontend — do not commit)
VITE_BFF_URL=http://localhost:8787
```

For production, set:

```env
VITE_BFF_URL=https://netcheck-bff.<your-subdomain>.workers.dev
```

Then replace direct calls to `ipapi.co` in the frontend with:

```ts
const BFF = import.meta.env.VITE_BFF_URL ?? "http://localhost:8787";
const ipInfo = await fetch(`${BFF}/ip-info`).then(r => r.json());
const nextDns = await fetch(`${BFF}/nextdns`).then(r => r.json());
```

---

## Deployment

```bash
# Authenticate with Cloudflare (first time only)
npx wrangler login

# Deploy to Cloudflare Workers
npx wrangler deploy
```

After deployment, update `VITE_BFF_URL` in the NetCheck frontend's production environment to your Worker URL (e.g. `https://netcheck-bff.<your-subdomain>.workers.dev`).

---

## Configuration

| `wrangler.toml` key | Value |
|---|---|
| `name` | `netcheck-bff` |
| `main` | `src/index.ts` |
| `compatibility_date` | `2026-04-27` |
| `compatibility_flags` | `nodejs_compat` |

---

## Type-check

```bash
npm run typecheck
```
