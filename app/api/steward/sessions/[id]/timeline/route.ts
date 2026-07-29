import { forwardToSteward } from "../../../client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return forwardToSteward(`/sessions/${encodeURIComponent(id)}/timeline`);
}
