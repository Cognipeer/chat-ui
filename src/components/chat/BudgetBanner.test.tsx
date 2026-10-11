import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { BudgetBanner } from "./BudgetBanner";

afterEach(cleanup);

const render = (ui: ReactElement, locale: "en" | "tr" = "en") => rtlRender(<ChatI18nProvider locale={locale}>{ui}</ChatI18nProvider>);
const pause = { maxCostUsd: 5, onReach: "pause" as const };
const stop = { maxCostUsd: 5, onReach: "stop" as const };

describe("BudgetBanner meter", () => {
  it("shows how much of the limit is used, as a progress bar", () => {
    render(<BudgetBanner budget={pause} spentUsd={1.25} exhausted={false} />);
    const bar = screen.getByRole("progressbar", { name: "Conversation usage" });
    expect(bar.getAttribute("aria-valuenow")).toBe("1.25");
    expect(bar.getAttribute("aria-valuemax")).toBe("5");
    expect(screen.getByText("$1.25 of $5.00 used")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can be turned off, and shows nothing without a limit or without a figure", () => {
    const { container } = render(<BudgetBanner budget={pause} spentUsd={1} exhausted={false} showMeter={false} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    expect(render(<BudgetBanner budget={null} spentUsd={1} exhausted={false} />).container.querySelector("[role=progressbar]")).toBeNull();
    cleanup();
    expect(render(<BudgetBanner budget={pause} exhausted={false} />).container.firstChild).toBeNull();
  });

  it("never goes past full", () => {
    render(<BudgetBanner budget={pause} spentUsd={9} exhausted />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("5");
  });

  it("speaks Turkish", () => {
    render(<BudgetBanner budget={pause} spentUsd={1} exhausted={false} />, "tr");
    expect(screen.getByRole("progressbar", { name: "Sohbet kullanımı" })).toBeTruthy();
  });
});

describe("BudgetBanner when the limit is used up", () => {
  it("a paused conversation says it carries on once the limit is raised", () => {
    render(<BudgetBanner budget={pause} spentUsd={5.1} exhausted />);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("This conversation reached its usage limit");
    expect(notice.textContent).toContain("carries on from where it stopped once the limit is raised");
    expect(notice.textContent).toContain("Ask an administrator to raise the limit.");
  });

  it("an ended one does not promise to carry on", () => {
    render(<BudgetBanner budget={stop} spentUsd={5.1} exhausted />);
    const text = screen.getByRole("status").textContent ?? "";
    expect(text).toContain("It has ended. Raise the limit to keep going.");
    expect(text).not.toContain("carries on");
  });

  it("offers Continue only where the host allows it, and only for a paused conversation", () => {
    const onContinue = vi.fn();
    render(<BudgetBanner budget={pause} spentUsd={5.1} exhausted canContinue onContinue={onContinue} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).not.toContain("Ask an administrator");
    cleanup();

    render(<BudgetBanner budget={stop} spentUsd={5.1} exhausted canContinue />);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    cleanup();

    render(<BudgetBanner budget={pause} spentUsd={5.1} exhausted />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("raises the limit and continues, after checking it is above what was spent", () => {
    const onUpdate = vi.fn();
    render(<BudgetBanner budget={pause} spentUsd={5.1} exhausted canEdit onUpdate={onUpdate} />);
    const field = screen.getByLabelText("New limit (USD)") as HTMLInputElement;

    fireEvent.click(screen.getByRole("button", { name: "Increase and continue" }));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Enter an amount above $5.10");
    expect(field.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(field, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase and continue" }));
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "7.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase and continue" }));
    expect(onUpdate).toHaveBeenCalledWith({ maxCostUsd: 7.5, onReach: "pause" }, { continue: true });
    expect(field.value).toBe("");
  });

  it("an ended conversation can only have its limit raised, and the composer reopens: no continue", () => {
    const onUpdate = vi.fn();
    render(<BudgetBanner budget={stop} spentUsd={5.1} exhausted canEdit onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText("New limit (USD)"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Increase limit" }));
    expect(onUpdate).toHaveBeenCalledWith({ maxCostUsd: 9, onReach: "stop" }, { continue: false });
    expect(screen.queryByRole("button", { name: "Increase and continue" })).toBeNull();
  });

  it("removes the limit", () => {
    const onUpdate = vi.fn();
    render(<BudgetBanner budget={pause} spentUsd={5.1} exhausted canEdit onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove limit" }));
    expect(onUpdate).toHaveBeenCalledWith(null, { continue: true });
  });

  it("holds its buttons while a change is being sent", () => {
    render(<BudgetBanner budget={pause} spentUsd={5.1} exhausted canEdit busy onUpdate={() => {}} />);
    expect((screen.getByRole("button", { name: "Increase and continue" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Remove limit" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the notice even when the figures are not known", () => {
    render(<BudgetBanner budget={null} exhausted />);
    expect(screen.getByRole("status").textContent).toContain("reached its usage limit");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
