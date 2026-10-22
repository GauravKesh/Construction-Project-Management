import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";

// Single-flight refresh, keyed by refresh token so concurrent requests from
// different users never share a refreshed access token. Settled results are kept
// briefly because refresh tokens rotate: requests already in flight with the old
// cookie must reuse the new token instead of presenting a revoked one.
const REFRESH_RESULT_TTL_MS = 30_000;
const refreshInFlight = new Map<string, Promise<string | null>>();

async function doRefresh(refreshToken: string): Promise<{ access_token: string; refresh_token: string } | null> {
  try {
    const res = await fetch(`${env.API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    };
  } catch (err) {
    console.error("Token refresh failed in proxy:", err);
    return null;
  }
}

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  let path = resolvedParams.path ? resolvedParams.path.join("/") : "";
  if (path.startsWith("api/v1/")) {
    path = path.slice("api/v1/".length);
  } else if (path === "api/v1") {
    path = "";
  }
  const search = req.nextUrl.search;
  const targetUrl = `${env.API_BASE_URL}/api/v1/${path}${search}`;

  const cookieStore = await cookies();
  let accessToken = cookieStore.get("bt_access_token")?.value;
  const refreshToken = cookieStore.get("bt_refresh_token")?.value;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    // Exclude host and cookie headers when forwarding
    if (!["host", "cookie", "content-length"].includes(key.toLowerCase())) {
      headers[key] = value;
    }
  });

  if (accessToken) {
    headers["authorization"] = `Bearer ${accessToken}`;
  }

  let body: BodyInit | null = null;
  if (!["GET", "HEAD"].includes(req.method)) {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      body = await req.formData();
      // Remove content-type so fetch sets multipart boundary automatically
      delete headers["content-type"];
    } else {
      body = await req.arrayBuffer();
    }
  }

  let backendRes = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
    cache: "no-store",
  });

  // Handle 401 Unauthorized with single-flight refresh
  if (backendRes.status === 401 && refreshToken) {
    let refreshPromise = refreshInFlight.get(refreshToken);
    if (!refreshPromise) {
      refreshPromise = doRefresh(refreshToken).then(async (newTokens) => {
        if (newTokens) {
          const isSecure = env.SESSION_COOKIE_SECURE;
          cookieStore.set("bt_access_token", newTokens.access_token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60,
          });
          cookieStore.set("bt_refresh_token", newTokens.refresh_token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 7,
          });
          return newTokens.access_token;
        } else {
          cookieStore.delete("bt_access_token");
          cookieStore.delete("bt_refresh_token");
          return null;
        }
      }).finally(() => {
        setTimeout(() => refreshInFlight.delete(refreshToken), REFRESH_RESULT_TTL_MS);
      });
      refreshInFlight.set(refreshToken, refreshPromise);
    }

    const refreshedAccessToken = await refreshPromise;

    if (refreshedAccessToken) {
      // Retry request with fresh access token
      headers["authorization"] = `Bearer ${refreshedAccessToken}`;
      backendRes = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        cache: "no-store",
      });
    }
  }

  // Create response
  const responseHeaders = new Headers();
  backendRes.headers.forEach((val, key) => {
    if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
      responseHeaders.set(key, val);
    }
  });

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    statusText: backendRes.statusText,
    headers: responseHeaders,
  });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const HEAD = handleProxy;
