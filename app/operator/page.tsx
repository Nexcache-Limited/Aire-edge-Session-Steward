import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import OperatorWorkspace from "./workspace";

export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const user = await requireChatGPTUser("/operator");
  return (
    <OperatorWorkspace
      operator={{ name: user.displayName, email: user.email }}
      signOutPath={chatGPTSignOutPath("/")}
      sessionId={
        process.env.STEWARD_DEMO_SESSION_ID ??
        "30000000-0000-4000-8000-000000000001"
      }
    />
  );
}
