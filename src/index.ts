import { Hono } from "hono";
import { cors } from "hono/cors";

// ---------------------------------------------------------------------------
// Allowed origins for strict CORS pinning
// Prevents third parties from using this Worker as a free proxy.
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://aym3nb.github.io", // production (GitHub Pages)
  "http://localhost:5173",    // Vite dev server
  "http://localhost:4173",    // Vite preview server
];

// ---------------------------------------------------------------------------
// TypeScript interfaces for all API response shapes
// ---------------------------------------------------------------------------

/** Response forwarded from https://test.nextdns.io/ */
export interface NextDnsResponse {
  status: string;
  protocol: string;
  profile?: string;
  server?: string;
  [key: string]: unknown;
}

/** Error wrapper returned when an upstream request fails */
export interface UpstreamErrorResponse {
  error: string;
  message: string;
  timestamp: string;
}

/**
 * Geolocation and network metadata derived from the Cloudflare cf object.
 *
 * Keys prefixed with a comment are intentionally compatible with the
 * frontend's IpInfo interface (previously sourced from ipapi.co) so the UI
 * rows work without changes.
 */
export interface IpInfoResponse {
  // ipapi.co-compatible keys consumed by the NetCheck frontend
  ip: string | null;
  isp: string | null;          // cf.asOrganization
  org: string | null;          // cf.asOrganization (same value)
  city: string | null;
  region: string | null;       // cf.region
  country_name: string | null; // cf.country (ISO-3166 alpha-2 code)
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  // Extended BFF-only fields
  country: string | null;      // ISO-3166 alpha-2 (same as country_name)
  continent: string | null;
  asn: number | null;
  asOrganization: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = new Hono();

/**
 * Global CORS middleware – strictly allows only the NetCheck frontend origins.
 * Unknown origins receive the production domain as the Allow-Origin value,
 * which causes browsers to reject the preflight and block the request.
 */
app.use(
  "/*",
  cors({
    origin: (origin) =>
      ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
    maxAge: 86400,
  })
);

/**
 * X-NetCheck-Edge middleware – stamps the Cloudflare PoP (Point of Presence)
 * IATA code on every response so the frontend can display which edge node
 * served the request (e.g. "CDG" for Paris, "LHR" for London).
 */
app.use("/*", async (c, next) => {
  await next();
  const cf = c.req.raw.cf as IncomingRequestCfProperties | undefined;
  if (cf?.colo) {
    c.header("X-NetCheck-Edge", cf.colo);
  }
});

// ---------------------------------------------------------------------------
// GET /nextdns
// ---------------------------------------------------------------------------

/**
 * Proxies a request to https://test.nextdns.io/ and returns the JSON payload.
 * This eliminates CORS issues that arise when the browser calls the endpoint
 * directly from a non-NextDNS-connected network.
 */
app.get("/nextdns", async (c) => {
  try {
    const upstream = await fetch("https://test.nextdns.io/", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000), // 10-second timeout
    });

    if (!upstream.ok) {
      const body: UpstreamErrorResponse = {
        error: "upstream_error",
        message: `NextDNS test endpoint returned HTTP ${upstream.status}`,
        timestamp: new Date().toISOString(),
      };
      return c.json(body, 502);
    }

    const data = (await upstream.json()) as NextDnsResponse;
    return c.json(data);
  } catch (err) {
    const isTimeout =
      err instanceof Error && err.name === "TimeoutError";
    const body: UpstreamErrorResponse = {
      error: isTimeout ? "upstream_timeout" : "upstream_fetch_error",
      message: isTimeout
        ? "The request to test.nextdns.io timed out after 10 seconds"
        : err instanceof Error
          ? err.message
          : "An unknown error occurred while contacting NextDNS",
      timestamp: new Date().toISOString(),
    };
    return c.json(body, 502);
  }
});

// ---------------------------------------------------------------------------
// GET /ip-info
// ---------------------------------------------------------------------------

/**
 * Extracts geolocation and network metadata that Cloudflare attaches to every
 * inbound request via the `cf` object.  All fields are safely defaulted to
 * `null` so the endpoint never crashes on missing metadata.
 */
app.get("/ip-info", (c) => {
  const cf = c.req.raw.cf as IncomingRequestCfProperties | undefined;

  const ip =
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Real-IP") ??
    null;

  const asOrganization = cf?.asOrganization ?? null;
  const country = cf?.country ?? null;
  const latitude = cf?.latitude != null ? Number(cf.latitude) : null;
  const longitude = cf?.longitude != null ? Number(cf.longitude) : null;

  const body: IpInfoResponse = {
    // ipapi.co-compatible fields (consumed by the NetCheck frontend)
    ip,
    isp: asOrganization,
    org: asOrganization,
    city: cf?.city ?? null,
    region: cf?.region ?? null,
    country_name: country,   // NOTE: CF provides ISO-3166 alpha-2 codes (e.g. "FR"), not full names.
                             // ipapi.co returns "France"; the frontend will display the code instead.
    latitude,
    longitude,
    timezone: cf?.timezone ?? null,
    // Extended BFF-only fields
    country,
    continent: cf?.continent ?? null,
    asn: cf?.asn ?? null,
    asOrganization,
    timestamp: new Date().toISOString(),
  };

  return c.json(body);
});

// ---------------------------------------------------------------------------
// Root health-check
// ---------------------------------------------------------------------------

app.get("/", (c) =>
  c.json({ status: "ok", service: "netcheck-bff", timestamp: new Date().toISOString() })
);

export default app;
