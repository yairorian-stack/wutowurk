import type { AnchorHTMLAttributes } from "react";
export default function Link({
  href,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0 ||
          !href?.startsWith("/")
        )
          return;
        event.preventDefault();
        history.pushState(null, "", href);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }}
    />
  );
}
