import { redirect } from "next/navigation";

/** El correo se quitó de BiBuru (a petición). Los enlaces antiguos (avisos, favoritos del navegador) llevan a Inicio. */
export default function CorreoPage() {
  redirect("/");
}
