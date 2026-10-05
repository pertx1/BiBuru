import { ChatView } from "@/components/ai/chat-view";
import { BudgetBanner } from "@/components/ai/budget-banner";
import { PageHeader } from "@/components/layout/page-header";
import { getContext } from "@/lib/context";
import { isPendingAction } from "@/lib/ai/tools";
import type { ChatLink } from "@/lib/ai/chat";
import type { ChatMessage } from "./actions";

export const metadata = { title: "Asistente" };

export default async function ChatPage() {
  const { supabase, workspaceId, userId } = await getContext();
  const { data: last } = await supabase.from("chat_messages").select("conversation_id").eq("workspace_id", workspaceId).eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const conversationId = last?.conversation_id ?? crypto.randomUUID();
  const { data } = last
    ? await supabase.from("chat_messages").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).eq("conversation_id", conversationId).order("created_at").limit(100)
    : { data: [] };
  const messages: ChatMessage[] = (data ?? []).map((r) => ({
    id: r.id, role: r.role as "user" | "assistant", content: r.content, links: Array.isArray(r.links) ? (r.links as ChatLink[]) : [],
    pending: isPendingAction(r.pending_action) ? { type: r.pending_action.type, summary: r.pending_action.summary } : null, actionStatus: r.action_status as ChatMessage["actionStatus"],
  }));
  return (
    <>
      <PageHeader title="Asistente" subtitle="Pregunta por tus datos o dile qué apuntar. Los gastos y pedidos siempre te los pide confirmar." />
      <BudgetBanner />
      <ChatView conversationId={conversationId} initial={messages} />
    </>
  );
}
