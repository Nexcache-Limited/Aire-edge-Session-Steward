import { NextResponse } from "next/server";
import {
  OPERATOR_SESSION_COOKIE,
  createOperatorSessionToken,
  operatorCredentialConfig,
  secureValueEqual,
} from "../../../operator-auth-session";
import {
  operatorAuthMode,
  safeRelativeReturnPath,
} from "../../../chatgpt-auth";

export async function POST(request: Request) {
  if (operatorAuthMode() === "chatgpt") {
    return Response.json(
      { error: "Credential authentication is not enabled." },
      { status: 404 },
    );
  }
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const returnTo = safeRelativeReturnPath(String(form.get("return_to") ?? "/operator"));

  let config;
  try {
    config = operatorCredentialConfig();
  } catch {
    return NextResponse.redirect(
      new URL(`/operator/login?error=config&return_to=${encodeURIComponent(returnTo)}`, request.url),
      303,
    );
  }

  const valid =
    email.toLowerCase() === config.email.toLowerCase() &&
    (await secureValueEqual(password, config.password));
  if (!valid) {
    return NextResponse.redirect(
      new URL(`/operator/login?error=invalid&return_to=${encodeURIComponent(returnTo)}`, request.url),
      303,
    );
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(
    OPERATOR_SESSION_COOKIE,
    await createOperatorSessionToken(config.email, config.secret),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60,
      path: "/",
    },
  );
  return response;
}
