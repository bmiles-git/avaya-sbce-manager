import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Console } from "@/components/console";
import { GuestUpload } from "@/components/guest-upload";
import { LoginScreen } from "@/components/login-screen";
import { entraClient, isAllowedAccount, loadEntraConfig, sessionFromAccount } from "@/lib/entra";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const session = useApp((s) => s.session);
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const read = () => {
      const match = window.location.hash.match(/^#\/upload\/([A-Za-z0-9_-]+)/);
      setGuest(match?.[1] ?? null);
    };
    read();
    window.addEventListener("hashchange", read);
    void (async () => {
      if (!useApp.persist.hasHydrated()) await useApp.persist.rehydrate();
      try {
        const config = await loadEntraConfig();
        if (!config.configured) {
          if (useApp.getState().session?.mode === "entra") useApp.getState().signOut();
          return;
        }
        const app = await entraClient(config);
        const result = await app.handleRedirectPromise();
        const accounts = app.getAllAccounts();
        const saved = useApp.getState().session;
        const account =
          result?.account ??
          accounts.find((item) => saved?.mode === "entra" && item.username.toLowerCase() === saved.username.toLowerCase()) ??
          (accounts.length === 1 ? accounts[0] : null);
        if (account && !isAllowedAccount(account, config.allowedDomain)) {
          sessionStorage.setItem(
            "entra-denied",
            `Only an @${config.allowedDomain || "allowed"} account can open this console.`,
          );
          useApp.getState().signOut();
          await app.logoutRedirect({ account, onRedirectNavigate: () => false });
          return;
        }
        if (account) {
          app.setActiveAccount(account);
          const next = sessionFromAccount(account);
          const current = useApp.getState().session;
          if (current?.mode !== "entra" || current.username.toLowerCase() !== next.username.toLowerCase()) {
            useApp.getState().signInEntra(next);
          }
        } else if (useApp.getState().session?.mode === "entra") useApp.getState().signOut();
      } catch {
        if (useApp.getState().session?.mode === "entra") useApp.getState().signOut();
      } finally {
        if (!cancel) setReady(true);
      }
    })();
    return () => {
      cancel = true;
      window.removeEventListener("hashchange", read);
    };
  }, []);

  if (guest) return <GuestUpload token={guest} />;
  if (session && ready) return <Console />;
  return <LoginScreen />;
}
