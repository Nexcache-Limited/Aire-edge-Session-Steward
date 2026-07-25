import { getOperatorUser } from "../../chatgpt-auth";

export async function forwardToSteward(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const user = await getOperatorUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  const baseUrl = process.env.SESSION_STEWARD_API_URL?.replace(/\/$/, "");
  const tenantId = process.env.SESSION_STEWARD_TENANT_ID;
  const apiToken = process.env.SESSION_STEWARD_API_TOKEN;
  if (!baseUrl || !tenantId || !apiToken) {
    return Response.json(
      {
        error:
          "SESSION_STEWARD_API_URL, SESSION_STEWARD_TENANT_ID, and SESSION_STEWARD_API_TOKEN are required.",
      },
      { status: 503 },
    );
  }
  if (process.env.NODE_ENV === "production" && !baseUrl.startsWith("https://")) {
    return Response.json(
      { error: "SESSION_STEWARD_API_URL must use HTTPS in production." },
      { status: 503 },
    );
  }

  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  headers.set("x-tenant-id", tenantId);
  headers.set("x-operator-email", user.email);
  headers.set("authorization", `Bearer ${apiToken}`);

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
