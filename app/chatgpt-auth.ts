import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  OPERATOR_SESSION_COOKIE,
  operatorCredentialConfig,
  verifyOperatorSessionToken,
} from "./operator-auth-session";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";
const CREDENTIAL_SIGN_IN_PATH = "/operator/login";
const CREDENTIAL_SIGN_OUT_PATH = "/api/operator/logout";

type OperatorAuthMode = "chatgpt" | "credentials" | "hybrid";

export async function getOperatorUser(): Promise<ChatGPTUser | null> {
  const mode = operatorAuthMode();
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (email && (mode === "chatgpt" || mode === "hybrid")) {
    const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
    const fullName =
      encodedFullName &&
      requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
        ? safeDecodeURIComponent(encodedFullName)
        : null;

    return {
      displayName: fullName ?? email,
      email,
      fullName,
    };
  }

  if (mode === "credentials" || mode === "hybrid") {
    const config = operatorCredentialConfig();
    const token = (await cookies()).get(OPERATOR_SESSION_COOKIE)?.value;
    if (!token) return null;
    const session = await verifyOperatorSessionToken(token, config.secret);
    if (!session || session.email.toLowerCase() !== config.email.toLowerCase()) {
      return null;
    }
    return {
      displayName: session.email,
      email: session.email,
      fullName: null,
    };
  }
  return null;
}

export async function requireOperatorUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getOperatorUser();
  if (user) return user;

  redirect(operatorSignInPath(returnTo));
}

export function operatorSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  if (operatorAuthMode() !== "chatgpt") {
    return `${CREDENTIAL_SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
  }
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function operatorSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  if (operatorAuthMode() !== "chatgpt") {
    return `${CREDENTIAL_SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
  }
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

export function operatorAuthMode(): OperatorAuthMode {
  const value = process.env.OPERATOR_AUTH_MODE ?? "chatgpt";
  if (value === "chatgpt" || value === "credentials" || value === "hybrid") {
    return value;
  }
  throw new Error(
    "OPERATOR_AUTH_MODE must be one of: chatgpt, credentials, hybrid.",
  );
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
