import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useModelChoice } from "./useModelChoice";
import type { AgentModelOption, Message } from "../types";

const models: AgentModelOption[] = [
  { key: "main", label: "Main", default: true },
  { key: "fast", label: "Fast", default: false },
];
const now = new Date();
const answer = (model: string): Message => ({ id: "a", conversationId: "c", role: "assistant", content: "x", metadata: { model }, createdAt: now, updatedAt: now });

describe("useModelChoice", () => {
  it("offers nothing for fewer than two models", () => {
    const { result } = renderHook(() => useModelChoice([models[0]!], undefined, []));
    expect(result.current.models).toBeUndefined();
    expect(result.current.getModel()).toBeUndefined();
  });

  it("starts on the default, sends only a picked model, and hands the pick to the created conversation", () => {
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useModelChoice(models, id, []), { initialProps: { id: undefined as string | undefined } });
    expect(result.current.selected).toBe("main");
    expect(result.current.getModel()).toBeUndefined();
    act(() => result.current.select("fast"));
    expect(result.current.selected).toBe("fast");
    expect(result.current.getModel()).toBe("fast");
    act(() => result.current.adopt("c1"));
    rerender({ id: "c1" });
    expect(result.current.selected).toBe("fast");
    expect(result.current.getModel()).toBe("fast");
    // a new chat starts from the default again
    rerender({ id: undefined });
    expect(result.current.selected).toBe("main");
  });

  it("shows the model of the last answer of an opened conversation", () => {
    const { result } = renderHook(() => useModelChoice(models, "c9", [answer("fast")]));
    expect(result.current.selected).toBe("fast");
  });
});
