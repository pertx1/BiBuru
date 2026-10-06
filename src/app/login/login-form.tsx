"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requestLogin, signInWithPassword, signUpWithPassword, verifyCode, type LoginState, type PasswordState } from "./actions";

type Mode = "entrar" | "crear" | "codigo";
const TABS: [Mode, string][] = [["entrar", "Entrar"], ["crear", "Crear cuenta"], ["codigo", "Código por correo"]];

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [emailState, emailAction, emailPending] = useActionState<LoginState, FormData>(requestLogin, {
    step: "email",
    error: linkError ? "El enlace no es válido o ha caducado. Pide otro." : undefined,
  });
  const [codeState, codeAction, codePending] = useActionState<LoginState, FormData>(verifyCode, {
    step: "code",
  });

  const [mode, setMode] = useState<Mode>("entrar");
  const [inState, inAction, inPending] = useActionState<PasswordState, FormData>(signInWithPassword, {});
  const [upState, upAction, upPending] = useActionState<PasswordState, FormData>(signUpWithPassword, {});

  const tabs = (
    <div role="tablist" aria-label="Forma de acceso" className="mb-1 grid grid-cols-3 gap-1 rounded-full bg-surface p-1">
      {TABS.map(([m, label]) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
          className={cn("min-h-11 rounded-full px-1 text-sm font-bold md:min-h-9", mode === m ? "bg-surface-2 shadow-sm" : "text-muted")}>{label}</button>
      ))}
    </div>
  );
  const emailField = <><label htmlFor="pw-email" className="text-sm font-medium">Correo electrónico</label><Input id="pw-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="tu@correo.com" required /></>;

  if (mode === "entrar") {
    return (
      <div className="flex flex-col gap-3">{tabs}
        <form action={inAction} className="flex flex-col gap-3">
          {emailField}
          <label htmlFor="pw" className="text-sm font-medium">Contraseña</label>
          <Input id="pw" name="password" type="password" autoComplete="current-password" required maxLength={72} />
          {(inState.error || linkError) && <p role="alert" className="text-sm text-danger">{inState.error ?? "El enlace no es válido o ha caducado. Pide otro."}</p>}
          <Button type="submit" disabled={inPending}>{inPending ? "Entrando…" : "Entrar"}</Button>
        </form>
      </div>
    );
  }
  if (mode === "crear") {
    return (
      <div className="flex flex-col gap-3">{tabs}
        <form action={upAction} className="flex flex-col gap-3">
          {emailField}
          <label htmlFor="pw-new" className="text-sm font-medium">Contraseña (mínimo 8 caracteres)</label>
          <Input id="pw-new" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
          <label htmlFor="pw-new2" className="text-sm font-medium">Repite la contraseña</label>
          <Input id="pw-new2" name="password2" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
          {upState.error && <p role="alert" className="text-sm text-danger">{upState.error}</p>}
          <Button type="submit" disabled={upPending}>{upPending ? "Creando…" : "Crear cuenta"}</Button>
          <p className="text-xs text-muted">No hace falta confirmar el correo. Entras directamente.</p>
        </form>
      </div>
    );
  }

  if (emailState.step === "code") {
    return (
      <div className="flex flex-col gap-3">{tabs}
      <form action={codeAction} className="flex flex-col gap-3">
        <input type="hidden" name="email" value={emailState.email} />
        <p className="text-sm text-muted">
          Si ese correo tiene acceso, te hemos enviado un enlace y un código de 6 dígitos a{" "}
          <strong className="text-foreground">{emailState.email}</strong>.
        </p>
        <label htmlFor="code" className="text-sm font-medium">
          Código del correo
        </label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={10}
          required
          autoFocus
        />
        {codeState.error && <p role="alert" className="text-sm text-danger">{codeState.error}</p>}
        <Button type="submit" disabled={codePending}>{codePending ? "Entrando…" : "Entrar"}</Button>
        <p className="text-xs text-muted">
          En iPhone, con la app instalada, usa el código: el enlace se abriría en Safari y no en la app.
        </p>
      </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">{tabs}
    <form action={emailAction} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">Correo electrónico</label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="tu@correo.com"
        required
        autoFocus
      />
      {emailState.error && <p role="alert" className="text-sm text-danger">{emailState.error}</p>}
      <Button type="submit" disabled={emailPending}>{emailPending ? "Enviando…" : "Enviarme el acceso"}</Button>
    </form>
    </div>
  );
}
