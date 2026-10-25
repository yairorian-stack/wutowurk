"use client";

import { useSyncExternalStore } from "react";
import { portalSchema, type PortalState } from "./domain";
import { createSeed } from "./seed";
import { scopedStorageKey } from "./browser-storage";

const KEY = "wuto-wurk-prototype-v1";
const serverState = createSeed();
let cache: PortalState = serverState;
let loaded = false;
let loadedKey = "";
let storageIssue = "";
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
function read() {
  const key = scopedStorageKey(KEY);
  if (loadedKey !== key) { loadedKey = key; loaded = false; cache = serverState; storageIssue = ""; }
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = portalSchema.safeParse(JSON.parse(raw));
        if (parsed.success) cache = parsed.data;
        else
          storageIssue =
            "保存データの形式を確認できませんでした。サンプルを表示しています。";
      } else {
        cache = serverState;
        storageIssue = "";
      }
    } catch {
      storageIssue =
        "ブラウザーの保存領域を利用できません。変更は保存できません。";
    }
  }
  return cache;
}
function onStorage(event: StorageEvent) {
  if (event.key === scopedStorageKey(KEY)) {
    loaded = false;
    read();
    emit();
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}
export function usePortal() {
  return useSyncExternalStore(subscribe, read, () => serverState);
}
export function getStorageIssue() {
  return storageIssue;
}
export function updatePortal(fn: (state: PortalState) => PortalState) {
  const next = fn(read());
  const parsed = portalSchema.safeParse(next);
  if (!parsed.success) throw new Error("データの形式が正しくありません");
  try {
    localStorage.setItem(scopedStorageKey(KEY), JSON.stringify(next));
  } catch {
    throw new Error(
      "保存できませんでした。ブラウザーの保存容量・設定をご確認ください。",
    );
  }
  cache = next;
  storageIssue = "";
  emit();
}
