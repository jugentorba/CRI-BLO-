// Historique des conversations de l'Assistant IA — store dédié, totalement
// indépendant du module CRI BLO.

import { STORE_AI_CHATS, reqAsync, tx } from "@/lib/db";

export interface AiMessage {
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface AiChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AiMessage[];
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean || "Conversation";
}

export async function listChats(): Promise<AiChat[]> {
  const all = (await tx(STORE_AI_CHATS, "readonly", (s) => reqAsync(s.getAll()))) as AiChat[];
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getChat(id: string): Promise<AiChat | undefined> {
  return (await tx(STORE_AI_CHATS, "readonly", (s) => reqAsync(s.get(id)))) as AiChat | undefined;
}

/** Ajoute un échange (note + réponse) à une conversation, ou en crée une. */
export async function appendExchange(
  chatId: string | null,
  userText: string,
  assistantText: string,
): Promise<AiChat> {
  const now = new Date().toISOString();
  const existing = chatId ? await getChat(chatId) : undefined;
  const chat: AiChat = existing
    ? { ...existing, updatedAt: now }
    : { id: uid(), title: titleFrom(userText), createdAt: now, updatedAt: now, messages: [] };
  chat.messages = [
    ...chat.messages,
    { role: "user", text: userText, at: now },
    { role: "assistant", text: assistantText, at: now },
  ];
  await tx(STORE_AI_CHATS, "readwrite", (s) => reqAsync(s.put(chat)));
  return chat;
}

export async function deleteChat(id: string): Promise<void> {
  await tx(STORE_AI_CHATS, "readwrite", (s) => reqAsync(s.delete(id)));
}

export async function clearChats(): Promise<void> {
  await tx(STORE_AI_CHATS, "readwrite", (s) => reqAsync(s.clear()));
}
