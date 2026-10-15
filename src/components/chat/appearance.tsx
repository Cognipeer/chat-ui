"use client";

import React from "react";

/**
 * How the chat is drawn.
 * - `classic` (default): avatars, a shaded band behind every answer, each step of the agent as its own message.
 * - `modern`: the person's messages as bubbles on the right, answers as plain text, the agent's steps folded into
 *   one "worked for ..." line, a single slim header and a lighter sidebar and composer.
 */
export type ChatAppearance = "classic" | "modern";

const AppearanceContext = React.createContext<ChatAppearance>("classic");

/** Sets the appearance for the chat components below it (`Chat` does this from its `appearance` prop). */
export const ChatAppearanceProvider = AppearanceContext.Provider;

/** The appearance of the chat this component is drawn in. */
export function useAppearance(): ChatAppearance {
  return React.useContext(AppearanceContext);
}

/**
 * The colour pair of an agent's badge: the same agent always gets the same tint. Translucent fills and
 * mid-tone letters, so a badge reads on a light and on a dark theme alike (it is decoration: the name is next to it).
 */
const BADGE_TINTS: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "rgba(16, 163, 127, 0.16)", fg: "#0f9b77" },
  { bg: "rgba(59, 130, 246, 0.16)", fg: "#3b82f6" },
  { bg: "rgba(217, 119, 6, 0.16)", fg: "#d97706" },
  { bg: "rgba(147, 51, 234, 0.15)", fg: "#9333ea" },
  { bg: "rgba(225, 29, 72, 0.14)", fg: "#e11d48" },
  { bg: "rgba(8, 145, 178, 0.16)", fg: "#0891b2" },
];

function hashOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** A small square with the agent's initial, tinted by its id. */
export function AgentBadge({ id, name, size = 22, className }: { id: string; name: string; size?: number; className?: string }) {
  const tint = BADGE_TINTS[hashOf(id || name) % BADGE_TINTS.length];
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      data-chat-agent-badge
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: tint.bg,
        color: tint.fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: Math.round(size * 0.5),
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
