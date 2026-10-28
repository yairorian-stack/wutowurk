"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Dialog({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      [
        ...(ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
        ) ?? []),
      ].filter((el) => el.getClientRects().length);
    (
      ref.current?.querySelector<HTMLElement>("input, textarea") ??
      focusable()[0]
    )?.focus();
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const elements = focusable(),
          first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`dialog ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={subtitle ? "dialog-subtitle" : undefined}
      >
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">WUTO-WURK GROWTH PORTAL</p>
            <h2 id="dialog-title">{title}</h2>
            {subtitle && (
              <p id="dialog-subtitle" className="muted">
                {subtitle}
              </p>
            )}
          </div>
          <button className="icon-button" onClick={close} aria-label="閉じる">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
