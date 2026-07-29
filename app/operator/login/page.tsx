import { operatorAuthMode, safeRelativeReturnPath } from "../../chatgpt-auth";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function OperatorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; return_to?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeRelativeReturnPath(query.return_to ?? "/operator");
  const credentialsEnabled =
    operatorAuthMode() === "credentials" || operatorAuthMode() === "hybrid";

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <span>AIRE–EDGE · LIVE STEWARD</span>
        <h1>Operator access</h1>
        <p>Sign in to manage persisted session contracts and evidence.</p>
        {!credentialsEnabled ? (
          <div className={styles.error}>
            Credential access is not enabled for this environment.
          </div>
        ) : (
          <form method="post" action="/api/operator/login">
            <input type="hidden" name="return_to" value={returnTo} />
            <label>
              Operator email
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {query.error === "invalid" && (
              <div className={styles.error}>The email or password is incorrect.</div>
            )}
            {query.error === "config" && (
              <div className={styles.error}>
                Operator authentication is not configured on this environment.
              </div>
            )}
            <button type="submit">Sign in</button>
          </form>
        )}
      </section>
    </main>
  );
}
