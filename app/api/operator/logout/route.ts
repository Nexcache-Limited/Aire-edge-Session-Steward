import { NextResponse } from "next/server";
import { OPERATOR_SESSION_COOKIE } from "../../../operator-auth-session";
import { safeRelativeReturnPath } from "../../../chatgpt-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const returnTo = safeRelativeReturnPath(url.searchParams.get("return_to") ?? "/");
  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(OPERATOR_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
