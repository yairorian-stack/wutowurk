"use client";
import { useSyncExternalStore } from "react";
import { createFinanceSeed, financeSchema, type FinanceState } from "./finance";
import { scopedStorageKey } from "./browser-storage";

export const FINANCE_KEY = "wuto-wurk-finance-demo-v1";
const initial = createFinanceSeed();
let cache: FinanceState = initial,
  loaded = false,
  issue = "";
const listeners = new Set<() => void>();
let loadedKey = "";
function read(force = false) {
  const key = scopedStorageKey(FINANCE_KEY);
  if (loadedKey !== key) { loadedKey = key; loaded = false; cache = initial; issue = ""; }
  if ((force || !loaded) && typeof window !== "undefined") {
    loaded = true;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        cache = initial;
        issue = "";
      } else {
        const parsed = financeSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          cache = parsed.data;
          issue = "";
        } else
          issue =
            "保存データの形式が正しくありません。上書きを停止しています。";
      }
    } catch {
      issue = "保存データを読み取れません。上書きを停止しています。";
    }
  }
  return cache;
}
function changed(event: StorageEvent) {
  if (event.key === scopedStorageKey(FINANCE_KEY) || event.key === null) {
    read(true);
    listeners.forEach((f) => f());
  }
}
function subscribe(fn: () => void) {
  listeners.add(fn);
  if (listeners.size === 1) window.addEventListener("storage", changed);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) window.removeEventListener("storage", changed);
  };
}
export function useFinance() {
  return useSyncExternalStore(subscribe, read, () => initial);
}
export function financeIssue() {
  return issue;
}
export function updateFinance(fn: (state: FinanceState) => FinanceState) {
  const current = read(true);
  if (issue) throw new Error(issue);
  const next = fn(current);
  const parsed = financeSchema.safeParse(next);
  if (!parsed.success)
    throw new Error("保存する日報・出納帳の形式を確認してください");
  try {
    localStorage.setItem(scopedStorageKey(FINANCE_KEY), JSON.stringify(next));
  } catch {
    throw new Error(
      "保存できません。ブラウザーの空き容量・設定を確認してください",
    );
  }
  cache = next;
  listeners.forEach((f) => f());
}
