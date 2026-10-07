import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { AssistedPublish } from "@/components/social/assisted-publish";
import { getContext } from "@/lib/context";
import { composeCaption } from "@/lib/social/stats";

export const metadata = { title: "Publicar en TikTok" };

/** Publicación asistida: el vídeo listo para descargar o compartir y el texto listo para copiar (se abre desde el aviso). */
export default async function PublicarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, workspaceId } = await getContext();
  const { data: post } = await supabase.from("social_posts").select("id, title, caption, hashtags, social_post_files(path, mime, position, deleted_at), social_post_targets(id, mode, status, account_id)").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (!post) notFound();
  const files = post.social_post_files.filter((f) => !f.deleted_at).sort((a, b) => a.position - b.position);
  const signed = await Promise.all(files.map(async (f) => {
    const ext = f.mime === "video/quicktime" ? "mov" : f.mime === "video/mp4" ? "mp4" : f.mime === "image/png" ? "png" : "jpg";
    const [view, dl] = await Promise.all([
      supabase.storage.from("social-media").createSignedUrl(f.path, 3600),
      supabase.storage.from("social-media").createSignedUrl(f.path, 3600, { download: `biburu-${id.slice(0, 8)}.${ext}` }),
    ]);
    return { mime: f.mime, view: view.data?.signedUrl ?? null, download: dl.data?.signedUrl ?? null, name: `biburu-${id.slice(0, 8)}.${ext}` };
  }));
  const target = post.social_post_targets.find((t) => t.mode === "assisted") ?? null;
  return (
    <>
      <PageHeader title="Publicar en TikTok" subtitle={post.title ?? undefined} />
      <AssistedPublish postId={post.id} targetId={target?.id ?? null} done={target?.status === "publicada"} caption={composeCaption(post.caption, post.hashtags)} files={signed} />
    </>
  );
}
