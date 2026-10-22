import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("bt_access_token")?.value;

  if (!token) {
    return NextResponse.json({ user: null });
  }

  try {
    const res = await fetch(`${env.API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return NextResponse.json({ user: null }, { status: res.status });
    }

    const user = await res.json();
    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
