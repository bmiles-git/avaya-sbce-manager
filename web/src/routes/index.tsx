import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Console } from "@/components/console";
import { GuestUpload } from "@/components/guest-upload";
import { LoginScreen } from "@/components/login-screen";
import { entraClient, loadEntraConfig, sessionFromAccount } from "@/lib/entra";
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
        const account = result?.account ?? app.getAllAccounts()[0] ?? null;
        if (account) useApp.getState().signInEntra(sessionFromAccount(account));
        else if (useApp.getState().session?.mode === "entra") useApp.getState().signOut();
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
