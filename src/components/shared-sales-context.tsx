"use client";
import { createContext, useContext } from "react";
import type { SharedSalesState } from "@/lib/shared-sales";
const SharedSalesContext = createContext<SharedSalesState | null>(null);
export function SharedSalesProvider({ value, children }: { value: SharedSalesState; children: React.ReactNode }) {
  return <SharedSalesContext.Provider value={value}>{children}</SharedSalesContext.Provider>;
}
export const useSharedSales = () => useContext(SharedSalesContext);
