import { getChatGPTUser } from "../../chatgpt-auth";

const DEFAULT_TENANT_ID = "10000000-0000-4000-8000-000000000001";

export async function forwardToSteward(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const baseUrl = process.env.SESSION_STEWARD_API_URL?.replace(/\/$/, "");
  if (!baseUrl) {
    return Response.json(
      { error: "The staging Session Steward API is not configured." },
      { status: 503 },
    );
  }

  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.set(
    "x-tenant-id",
    process.env.SESSION_STEWARD_TENANT_ID ?? DEFAULT_TENANT_ID,
  );
  headers.set("x-operator-email", user.email);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "content-type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return Response.json(
      { error: "The staging Session Steward API is unavailable." },
      { status: 502 },
    );
  }
}
