"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestLogin, verifyCode, type LoginState } from "./actions";

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [emailState, emailAction, emailPending] = useActionState<LoginState, FormData>(requestLogin, {
    step: "email",
    error: linkError ? "El enlace no es válido o ha caducado. Pide otro." : undefined,
  });
  const [codeState, codeAction, codePending] = useActionState<LoginState, FormData>(verifyCode, {
    step: "code",
  });

  if (emailState.step === "code") {
    return (
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
    );
  }

  return (
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
  );
}
