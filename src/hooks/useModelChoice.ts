"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentModelOption, Message } from "../types";
import { modelOfMessage } from "../utils/models";

const NEW_CHAT = "";

/**
 * The model the person picked, kept per conversation. A choice made before the first message belongs to
 * the conversation that message creates; a conversation opened without a choice shows the model of its
 * last answer (so a reload keeps it), else the agent's default. A new chat starts from the default.
 */
export function useModelChoice(models: AgentModelOption[] | undefined, conversationId: string | undefined, messages: Message[]) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const idRef = useRef(conversationId);
  idRef.current = conversationId;
  const offered = models && models.length > 1 ? models : undefined;
  const known = useCallback((key: string | undefined) => (key && offered?.some((m) => m.key === key) ? key : undefined), [offered]);

  // A new chat starts over
  useEffect(() => {
    if (conversationId === undefined) setPicks((p) => (NEW_CHAT in p ? omit(p, NEW_CHAT) : p));
  }, [conversationId]);

  const lastAnswered = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const key = known(modelOfMessage(messages[i]!));
      if (key) return key;
    }
    return undefined;
  })();

  const selected =
    known(picks[conversationId ?? NEW_CHAT]) ?? lastAnswered ?? offered?.find((m) => m.default)?.key ?? offered?.[0]?.key;

  const select = useCallback((key: string) => {
    setPicks((p) => ({ ...p, [idRef.current ?? NEW_CHAT]: key }));
  }, []);

  /** What to send with the next message; `undefined` while the default is in force and nothing was picked */
  const getModel = useCallback((): string | undefined => {
    if (!offered) return undefined;
    const picked = known(picksRef.current[idRef.current ?? NEW_CHAT]);
    if (picked) return picked;
    // (no pick: the server keeps the conversation's last model, or the default)
    return undefined;
  }, [offered, known]);

  /** The conversation a first message created takes over the choice made before it */
  const adopt = useCallback((id: string) => {
    setPicks((p) => (NEW_CHAT in p ? { ...omit(p, NEW_CHAT), [id]: p[NEW_CHAT]! } : p));
    picksRef.current = picksRef.current[NEW_CHAT] ? { ...omit(picksRef.current, NEW_CHAT), [id]: picksRef.current[NEW_CHAT]! } : picksRef.current;
  }, []);

  return { models: offered, selected, select, getModel, adopt };
}

function omit(record: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _gone, ...rest } = record;
  return rest;
}
