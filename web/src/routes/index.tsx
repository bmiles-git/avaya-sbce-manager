import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Console } from "@/components/console";
import { GuestUpload } from "@/components/guest-upload";
import { LoginScreen } from "@/components/login-screen";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const session = useApp((s) => s.session);
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState<string | null>(null);

  useEffect(() => {
    const unsub = useApp.persist.onFinishHydration(() => setReady(true));
    if (useApp.persist.hasHydrated()) setReady(true);
    else void useApp.persist.rehydrate();
    const read = () => {
      const match = window.location.hash.match(/^#\/upload\/([A-Za-z0-9_-]+)/);
      setGuest(match?.[1] ?? null);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => {
      unsub();
      window.removeEventListener("hashchange", read);
    };
  }, []);

  if (guest) return <GuestUpload token={guest} />;
  if (session && ready) return <Console />;
  return <LoginScreen />;
}
