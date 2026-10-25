"use client";
import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import type { Member } from "@/lib/membership";
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
  const ready = useSyncExternalStore(
    subscribeStorageUser,
    () => storageUserId() === member.user_id,
    () => false,
  );
  useEffect(() => {
    setStorageUser(member.user_id);
  }, [member.user_id]);
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
