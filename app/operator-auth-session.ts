export const OPERATOR_SESSION_COOKIE = "aire_operator_session";

const MAX_SESSION_AGE_SECONDS = 8 * 60 * 60;

export type OperatorCredentialConfig = {
  email: string;
  password: string;
  secret: string;
};

type SessionPayload = {
  email: string;
  expiresAt: number;
};

export function operatorCredentialConfig(): OperatorCredentialConfig {
  const email = process.env.OPERATOR_AUTH_EMAIL?.trim();
  const password = process.env.OPERATOR_AUTH_PASSWORD;
  const secret = process.env.OPERATOR_AUTH_SECRET;

  if (!email || !password || !secret) {
    throw new Error(
      "Credential auth requires OPERATOR_AUTH_EMAIL, OPERATOR_AUTH_PASSWORD, and OPERATOR_AUTH_SECRET.",
    );
  }
  if (secret.length < 32) {
    throw new Error("OPERATOR_AUTH_SECRET must contain at least 32 characters.");
  }
  return { email, password, secret };
}

export async function createOperatorSessionToken(
  email: string,
  secret: string,
): Promise<string> {
  const payload = encodeText(
    JSON.stringify({
      email,
      expiresAt: Math.floor(Date.now() / 1000) + MAX_SESSION_AGE_SECONDS,
    } satisfies SessionPayload),
  );
  return `${payload}.${await signature(payload, secret)}`;
}

export async function verifyOperatorSessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) return null;
  if (!constantTimeEqual(providedSignature, await signature(payload, secret))) {
    return null;
  }

  try {
    const value = JSON.parse(decodeText(payload)) as Partial<SessionPayload>;
    if (
      typeof value.email !== "string" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { email: value.email, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export async function secureValueEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([digest(left), digest(right)]);
  return constantTimeEqual(leftHash, rightHash);
}

async function signature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return encodeBytes(new Uint8Array(bytes));
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return encodeBytes(new Uint8Array(bytes));
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function encodeText(value: string): string {
  return encodeBytes(new TextEncoder().encode(value));
}

function decodeText(value: string): string {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function encodeBytes(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
