"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { memberAccessChanged, type Member } from "@/lib/membership";
import {
  setStorageUser,
  storageUserId,
  subscribeStorageUser,
} from "@/lib/browser-storage";
const MemberContext = createContext<Member | null>(null);
export function MemberProvider({
  member,
  children,
}: {
  member: Member;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribeStorageUser,
    () => storageUserId() === member.user_id,
    () => false,
  );
  useEffect(() => {
    setStorageUser(member.user_id);
  }, [member.user_id]);
  useEffect(() => {
    let controller: AbortController | null = null;
    let disposed = false;
    async function recheck() {
      if (document.hidden || controller) return;
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 8000);
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store", credentials: "same-origin", signal: request.signal,
        });
        if (disposed) return;
        if (response.status === 401) { router.refresh(); return; }
        if (!response.ok) return;
        const access: unknown = await response.json();
        if (!disposed && memberAccessChanged(member, access)) router.refresh();
      } catch {
        // A transient failure never changes authority; every save is checked server-side.
      } finally {
        window.clearTimeout(timeout);
        controller = null;
      }
    }
    void recheck();
    const onFocus = () => { void recheck(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [member, pathname, router]);
  return ready ? (
    <MemberContext.Provider value={member}>{children}</MemberContext.Provider>
  ) : (
    <main className="loading-portal" aria-busy="true">
      ログイン情報を確認しています…
    </main>
  );
}
export function useMember() {
  return useContext(MemberContext);
}
