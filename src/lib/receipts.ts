"use client";

import { createClient } from "@/lib/supabase/client";

const MAX_SIDE = 1600;

/** Reduce la foto del ticket (máx. 1600 px, JPEG) para no gastar el almacenamiento gratuito. */
async function compress(file: File): Promise<Blob> {
  if (file.type === "application/pdf" || !file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.8));
}

/** Sube un ticket y devuelve su ruta (workspace/negocio/archivo). */
export async function uploadReceipt(file: File, workspaceId: string, businessId: string): Promise<string> {
  const blob = await compress(file);
  const isPdf = file.type === "application/pdf";
  const path = `${workspaceId}/${businessId}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
  const { error } = await createClient().storage.from("receipts").upload(path, blob, {
    contentType: isPdf ? "application/pdf" : "image/jpeg",
  });
  if (error) throw new Error("No se pudo subir el ticket");
  return path;
}

export async function receiptUrl(path: string): Promise<string | null> {
  const { data } = await createClient().storage.from("receipts").createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}
