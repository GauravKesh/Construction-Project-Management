import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/env";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("bt_access_token")?.value;
    const refreshToken = cookieStore.get("bt_refresh_token")?.value;

    if (token) {
      try {
        await fetch(`${env.API_BASE_URL}/api/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: refreshToken ? JSON.stringify({ refresh_token: refreshToken }) : undefined,
        });
      } catch (e) {
        // Continue clearing cookies regardless
      }
    }

    cookieStore.delete("bt_access_token");
    cookieStore.delete("bt_refresh_token");

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
