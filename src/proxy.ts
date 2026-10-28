import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authConfig } from "@/lib/auth-config";
export async function proxy(request: NextRequest) {
  const config = authConfig();
  if (!config) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      secure: config.secure,
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            secure: config.secure,
            sameSite: "lax",
            path: "/",
          }),
        );
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch {
    /* The page and API guards still fail closed. */
  }
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon.svg|manifest.webmanifest|favicon.ico|robots.txt).*)",
  ],
};
