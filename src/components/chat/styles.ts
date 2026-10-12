import { cn } from "../../utils";

/** Class names the cards, banners and notices share, so their buttons look alike. */

export const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-chat-accent-primary focus-visible:ring-offset-1 focus-visible:ring-offset-chat-bg-secondary";

export const BUTTON_BASE = cn(
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
  "disabled:opacity-50 disabled:cursor-not-allowed",
  FOCUS_RING
);

export const PRIMARY_BUTTON = cn(
  BUTTON_BASE,
  "bg-chat-accent-primary text-chat-text-inverse hover:bg-chat-accent-secondary"
);

export const SECONDARY_BUTTON = cn(
  BUTTON_BASE,
  "border border-chat-border-primary bg-chat-bg-primary text-chat-text-primary hover:bg-chat-bg-hover"
);
