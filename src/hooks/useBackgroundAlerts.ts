"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** What the host switched on (see `NotificationsConfig`). */
export interface BackgroundAlertsConfig {
  tabBadge: boolean;
  sound: boolean;
  desktop: "off" | "opt_in";
}

export interface UseBackgroundAlertsOptions {
  config: BackgroundAlertsConfig;
  /** A turn is running */
  busy: boolean;
  /** An approval or a question waits for the person */
  waiting: boolean;
  /** Text of a desktop notification when a turn finished */
  doneText: string;
  /** Text of a desktop notification when something waits for the person */
  waitingText: string;
  /** Heading of a desktop notification (the conversation's title) */
  heading: string;
}

export interface BackgroundAlerts {
  /** Alerts not seen yet (what the tab title shows) */
  count: number;
  /** The bell menu has something to offer (a sound, or desktop notifications the person can turn on) */
  available: boolean;
  /** The person's own choices, remembered on this device */
  prefs: { sound: boolean; desktop: boolean };
  /** This browser can show desktop notifications */
  desktopSupported: boolean;
  /** `denied`: the browser blocks them, the person has to allow them in its settings */
  permission: "default" | "granted" | "denied" | "unsupported";
  setSound: (on: boolean) => void;
  /** Turning it on asks the browser for permission (only now, on the person's click); resolves whether it is on */
  setDesktop: (on: boolean) => Promise<boolean>;
}

const PREFS_KEY = "cp:notify:prefs";

/** The tab title with the number of unseen alerts in front. */
export function formatBadgeTitle(base: string, count: number): string {
  return count > 0 ? `(${count}) ${base}` : base;
}

function readPrefs(defaults: { sound: boolean; desktop: boolean }): { sound: boolean; desktop: boolean } {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PREFS_KEY) : null;
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as { sound?: unknown; desktop?: unknown };
    return {
      sound: typeof parsed.sound === "boolean" ? parsed.sound : defaults.sound,
      desktop: typeof parsed.desktop === "boolean" ? parsed.desktop : defaults.desktop,
    };
  } catch {
    return defaults;
  }
}

function writePrefs(prefs: { sound: boolean; desktop: boolean }): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // kept for this page view only
  }
}

const notificationApi = (): typeof Notification | undefined =>
  typeof window !== "undefined" && "Notification" in window ? window.Notification : undefined;

let audio: AudioContext | undefined;

/** Makes (during a click: browsers only allow sound after one) or wakes the audio context. */
function prepareSound(): void {
  try {
    const Ctor = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    // no sound
  }
}

/** A short two-note chime, quiet; silent when the browser does not allow sound yet. */
function playChime(): void {
  try {
    prepareSound();
    if (!audio || audio.state !== "running") return;
    const at = audio.currentTime;
    for (const [i, hz] of [660, 880].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.06, at + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.14 + 0.16);
      osc.connect(gain).connect(audio.destination);
      osc.start(at + i * 0.14);
      osc.stop(at + i * 0.14 + 0.18);
    }
  } catch {
    // no sound
  }
}

/**
 * Tells the person, while the tab is in the background, that a turn finished or that something
 * waits for them: "(1)" in front of the tab title, an optional chime and, only if they turned it on
 * in the bell menu, a desktop notification. Everything goes back to normal when the tab is looked at again.
 */
export function useBackgroundAlerts(options: UseBackgroundAlertsOptions): BackgroundAlerts {
  const { config, busy, waiting } = options;
  const [count, setCount] = useState(0);
  // The sound is the host's offer; the person may mute it. Desktop notifications start off: they need the person's yes.
  const [prefs, setPrefsState] = useState(() => readPrefs({ sound: true, desktop: false }));
  const [permission, setPermission] = useState<BackgroundAlerts["permission"]>(() => notificationApi()?.permission ?? "unsupported");

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const baseTitleRef = useRef<string | null>(null);
  const countRef = useRef(0);
  const previous = useRef({ busy, waiting });

  const enabled = config.tabBadge || config.sound || config.desktop === "opt_in";

  const restoreTitle = useCallback(() => {
    countRef.current = 0;
    setCount(0);
    if (baseTitleRef.current !== null && typeof document !== "undefined") {
      document.title = baseTitleRef.current;
    }
    baseTitleRef.current = null;
  }, []);

  const alert = useCallback((kind: "done" | "waiting") => {
    const { config: current, doneText, waitingText, heading } = optionsRef.current;
    if (typeof document === "undefined") return;
    countRef.current += 1;
    setCount(countRef.current);
    if (current.tabBadge) {
      baseTitleRef.current ??= document.title;
      document.title = formatBadgeTitle(baseTitleRef.current, countRef.current);
    }
    if (current.sound && prefsRef.current.sound) playChime();
    const api = notificationApi();
    if (current.desktop === "opt_in" && prefsRef.current.desktop && api?.permission === "granted") {
      try {
        // one notification per conversation: a newer one replaces the older
        new api(heading, { body: kind === "done" ? doneText : waitingText, tag: "cp-chat-alert" });
      } catch {
        // some browsers only allow notifications from a service worker
      }
    }
  }, []);

  // A turn ended, or something started to wait, while nobody was looking
  useEffect(() => {
    const before = previous.current;
    previous.current = { busy, waiting };
    if (!enabled || typeof document === "undefined" || !document.hidden) return;
    if (waiting && !before.waiting) alert("waiting");
    else if (before.busy && !busy && !waiting) alert("done");
  }, [busy, waiting, enabled, alert]);

  // Looking at the tab again clears the badge
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const onVisible = () => {
      if (!document.hidden) restoreTitle();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, restoreTitle]);

  useEffect(() => () => restoreTitle(), [restoreTitle]);

  const setSound = useCallback((on: boolean) => {
    if (on) prepareSound();
    const next = { ...prefsRef.current, sound: on };
    prefsRef.current = next;
    setPrefsState(next);
    writePrefs(next);
  }, []);

  const setDesktop = useCallback(async (on: boolean): Promise<boolean> => {
    const api = notificationApi();
    let allowed = on;
    if (on) {
      if (!api) {
        allowed = false;
      } else if (api.permission === "granted") {
        allowed = true;
      } else if (api.permission === "denied") {
        allowed = false;
      } else {
        try {
          allowed = (await api.requestPermission()) === "granted";
        } catch {
          allowed = false;
        }
      }
      setPermission(api?.permission ?? "unsupported");
    }
    const next = { ...prefsRef.current, desktop: allowed };
    prefsRef.current = next;
    setPrefsState(next);
    writePrefs(next);
    return allowed;
  }, []);

  return {
    count,
    available: config.sound || config.desktop === "opt_in",
    prefs,
    desktopSupported: Boolean(notificationApi()),
    permission,
    setSound,
    setDesktop,
  };
}
