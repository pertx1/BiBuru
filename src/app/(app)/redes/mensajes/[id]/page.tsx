import { redirect } from "next/navigation";

/** Los mensajes de Instagram y TikTok se quitaron de BiBuru: los enlaces antiguos llevan a Redes. */
export default function MensajePage() {
  redirect("/redes");
}
