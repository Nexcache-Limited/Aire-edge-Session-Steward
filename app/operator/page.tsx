import { operatorSignOutPath, requireOperatorUser } from "../chatgpt-auth";
import OperatorWorkspace from "./workspace";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const user = await requireOperatorUser("/operator");
  const sessionId = process.env.STEWARD_DEMO_SESSION_ID;
  if (!sessionId && process.env.NODE_ENV === "production") {
    throw new Error("STEWARD_DEMO_SESSION_ID is required for the operator route.");
  }
  return (
    <OperatorWorkspace
      operator={{ name: user.displayName, email: user.email }}
      signOutPath={operatorSignOutPath("/")}
      sessionId={sessionId ?? "30000000-0000-4000-8000-000000000001"}
    />
  );
}
