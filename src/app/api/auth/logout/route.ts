import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { finishAttendance } from "@/lib/attendance-queries";

// Logout changes session state, so GET/prefetch requests must never execute it.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (user) await finishAttendance(user);
  } catch (error) {
    console.error("Attendance checkout failed:", error);
    // Keep the cookie so the employee can retry without losing their checkout.
    return NextResponse.redirect(new URL("/attendance?checkoutError=1", request.url), 303);
  }
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.delete("staff-access");
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
