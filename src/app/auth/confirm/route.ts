import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailAllowed } from "@/lib/allowed-emails";
import { createClient } from "@/lib/supabase/server";

/** Destino del enlace mágico del correo: canjea el token y entra. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    const email = data.user?.email;
    if (!error && email && isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
      return NextResponse.redirect(`${origin}/`);
    }
    if (!error) await supabase.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/login?error=enlace`);
}
