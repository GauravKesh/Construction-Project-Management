import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Call backend login
    const backendRes = await fetch(`${env.API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await backendRes.json();

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.detail || "Authentication failed" },
        { status: backendRes.status }
      );
    }

    const { access_token, refresh_token } = data;

    // Fetch user details
    const meRes = await fetch(`${env.API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const user = meRes.ok ? await meRes.json() : null;

    const cookieStore = await cookies();
    const isSecure = env.SESSION_COOKIE_SECURE;

    // Set httpOnly cookies
    cookieStore.set("bt_access_token", access_token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1 hour
    });

    cookieStore.set("bt_refresh_token", refresh_token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (error: any) {
    console.error("Login BFF route error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
