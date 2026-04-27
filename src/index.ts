import { Hono } from "hono";
import { cors } from "hono/cors";

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

/** Geolocation and network metadata derived from the Cloudflare cf object */
export interface IpInfoResponse {
  ip: string | null;
  city: string | null;
  country: string | null;
  continent: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  asn: number | null;
  asOrganization: string | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = new Hono();

/**
 * Global CORS middleware – allows the NetCheck frontend (and any origin during
 * development) to call this Worker from a browser without CORS errors.
 */
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "OPTIONS"],
    allowHeaders: ["Content-Type", "Accept"],
    maxAge: 86400,
  })
);

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
        ? "The request to test.nextdns.io timed out after 10 s"
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

  const body: IpInfoResponse = {
    ip,
    city: cf?.city ?? null,
    country: cf?.country ?? null,
    continent: cf?.continent ?? null,
    latitude: cf?.latitude != null ? Number(cf.latitude) : null,
    longitude: cf?.longitude != null ? Number(cf.longitude) : null,
    timezone: cf?.timezone ?? null,
    asn: cf?.asn ?? null,
    asOrganization: cf?.asOrganization ?? null,
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
