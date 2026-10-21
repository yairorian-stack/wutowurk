import type { AnchorHTMLAttributes } from "react";
export default function Link({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href?.startsWith("/") ? `#${href}` : href} />;
}
