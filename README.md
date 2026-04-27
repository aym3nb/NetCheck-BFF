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
[Cloudflare Worker – netcheck-bff]
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

**Success response – `200 OK`**

```json
{
  "ip": "203.0.113.42",
  "city": "Paris",
  "country": "FR",
  "continent": "EU",
  "latitude": 48.8566,
  "longitude": 2.3522,
  "timezone": "Europe/Paris",
  "asn": 12345,
  "asOrganization": "Example ISP",
  "timestamp": "2026-04-27T08:00:00.000Z"
}
```

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

## Local Development

```bash
# Install dependencies
npm install

# Start local dev server (powered by Miniflare)
npm run dev
```

The Worker will be available at `http://localhost:8787`.

---

## Deployment

```bash
# Authenticate with Cloudflare (first time only)
npx wrangler login

# Deploy to Cloudflare Workers
npx wrangler deploy
```

After deployment, update the NetCheck frontend to point to your Worker URL (e.g. `https://netcheck-bff.<your-subdomain>.workers.dev`).

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
