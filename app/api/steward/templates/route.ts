import { forwardToSteward } from "../client";

export const dynamic = "force-dynamic";

export async function GET() {
  return forwardToSteward("/contract-templates");
}

export async function POST(request: Request) {
  return forwardToSteward("/contract-templates", {
    method: "POST",
    body: await request.text(),
  });
}
