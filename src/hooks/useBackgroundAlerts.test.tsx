import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { formatBadgeTitle, useBackgroundAlerts, type UseBackgroundAlertsOptions } from "./useBackgroundAlerts";

let hidden = false;
const setHidden = (value: boolean) => {
  hidden = value;
  document.dispatchEvent(new Event("visibilitychange"));
};

const base: UseBackgroundAlertsOptions = {
  config: { tabBadge: true, sound: false, desktop: "off" },
  busy: false,
  waiting: false,
  heading: "Support",
  doneText: "Ready",
  waitingText: "Needs you",
};

beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.title = "Portal";
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("formatBadgeTitle", () => {
  it("puts the count in front, or leaves the title alone", () => {
    expect(formatBadgeTitle("Portal", 2)).toBe("(2) Portal");
    expect(formatBadgeTitle("Portal", 0)).toBe("Portal");
  });
});

describe("tab badge", () => {
  it("counts a turn that ends while the tab is hidden and clears when it is looked at again", () => {
    const { rerender } = renderHook((props: UseBackgroundAlertsOptions) => useBackgroundAlerts(props), { initialProps: { ...base, busy: true } });
    act(() => setHidden(true));
    rerender({ ...base, busy: false });
    expect(document.title).toBe("(1) Portal");
    // another one: the number grows, the original title is remembered once
    rerender({ ...base, busy: true });
    rerender({ ...base, busy: false });
    expect(document.title).toBe("(2) Portal");
    act(() => setHidden(false));
    expect(document.title).toBe("Portal");
  });

  it("does nothing while the tab is visible", () => {
    const { rerender } = renderHook((props: UseBackgroundAlertsOptions) => useBackgroundAlerts(props), { initialProps: { ...base, busy: true } });
    rerender({ ...base, busy: false });
    expect(document.title).toBe("Portal");
  });

  it("counts something that starts to wait for the person", () => {
    const { rerender } = renderHook((props: UseBackgroundAlertsOptions) => useBackgroundAlerts(props), { initialProps: base });
    act(() => setHidden(true));
    rerender({ ...base, busy: true });
    rerender({ ...base, busy: false, waiting: true });
    expect(document.title).toBe("(1) Portal");
  });

  it("leaves the title alone when the badge is off", () => {
    const { rerender } = renderHook((props: UseBackgroundAlertsOptions) => useBackgroundAlerts(props), {
      initialProps: { ...base, config: { tabBadge: false, sound: false, desktop: "off" as const }, busy: true },
    });
    act(() => setHidden(true));
    rerender({ ...base, config: { tabBadge: false, sound: false, desktop: "off" }, busy: false });
    expect(document.title).toBe("Portal");
  });

  it("puts the title back when the chat goes away", () => {
    const { rerender, unmount } = renderHook((props: UseBackgroundAlertsOptions) => useBackgroundAlerts(props), { initialProps: { ...base, busy: true } });
    act(() => setHidden(true));
    rerender({ ...base, busy: false });
    expect(document.title).toBe("(1) Portal");
    unmount();
    expect(document.title).toBe("Portal");
  });
});

describe("desktop notifications", () => {
  function stubNotification(permission: NotificationPermission, requested: NotificationPermission = "granted") {
    const shown: Array<[string, NotificationOptions | undefined]> = [];
    const requestPermission = vi.fn(async () => {
      Notification_.permission = requested;
      return requested;
    });
    class Notification_ {
      static permission: NotificationPermission = permission;
      static requestPermission = requestPermission;
      constructor(title: string, options?: NotificationOptions) {
        shown.push([title, options]);
      }
    }
    vi.stubGlobal("Notification", Notification_);
    (window as unknown as { Notification: unknown }).Notification = Notification_;
    return { shown, requestPermission };
  }

  const opt = { ...base, config: { tabBadge: false, sound: false, desktop: "opt_in" as const } };

  it("never asks the browser for permission by itself", () => {
    const { requestPermission } = stubNotification("default");
    renderHook(() => useBackgroundAlerts(opt));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("asks only when the person turns it on, and shows a notification once they have", async () => {
    const { shown, requestPermission } = stubNotification("default");
    const { result, rerender } = renderHook((props: UseBackgroundAlertsOptions) => useBackgroundAlerts(props), { initialProps: { ...opt, busy: true } });
    expect(result.current.available).toBe(true);
    await act(async () => {
      expect(await result.current.setDesktop(true)).toBe(true);
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(result.current.prefs.desktop).toBe(true);
    act(() => setHidden(true));
    rerender({ ...opt, busy: false });
    expect(shown).toEqual([["Support", { body: "Ready", tag: "cp-chat-alert" }]]);
  });

  it("stays off when the browser refuses", async () => {
    stubNotification("default", "denied");
    const { result } = renderHook(() => useBackgroundAlerts(opt));
    await act(async () => {
      expect(await result.current.setDesktop(true)).toBe(false);
    });
    expect(result.current.prefs.desktop).toBe(false);
    expect(result.current.permission).toBe("denied");
  });

  it("shows nothing without the person's yes", () => {
    const { shown } = stubNotification("granted");
    const { rerender } = renderHook((props: UseBackgroundAlertsOptions) => useBackgroundAlerts(props), { initialProps: { ...opt, busy: true } });
    act(() => setHidden(true));
    rerender({ ...opt, busy: false });
    expect(shown).toEqual([]);
  });

  it("remembers the person's choices on the device", async () => {
    stubNotification("granted");
    const first = renderHook(() => useBackgroundAlerts({ ...opt, config: { tabBadge: false, sound: true, desktop: "opt_in" } }));
    await act(async () => {
      await first.result.current.setDesktop(true);
    });
    act(() => first.result.current.setSound(false));
    first.unmount();
    const second = renderHook(() => useBackgroundAlerts({ ...opt, config: { tabBadge: false, sound: true, desktop: "opt_in" } }));
    expect(second.result.current.prefs).toEqual({ sound: false, desktop: true });
  });
});

describe("the bell menu", () => {
  it("has something to offer only for a sound or opt-in desktop notifications", () => {
    expect(renderHook(() => useBackgroundAlerts(base)).result.current.available).toBe(false);
    expect(renderHook(() => useBackgroundAlerts({ ...base, config: { tabBadge: false, sound: true, desktop: "off" } })).result.current.available).toBe(true);
  });
});
