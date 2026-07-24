import { forwardToSteward } from "../../../client";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return forwardToSteward(`/sessions/${encodeURIComponent(id)}/contract`, {
    method: "POST",
    body: await request.text(),
  });
}
