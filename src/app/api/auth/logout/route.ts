import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  response.cookies.set("session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });

  return response;
}
