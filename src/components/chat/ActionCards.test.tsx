import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { ChatI18nProvider } from "../../providers";
import { QuestionCard, ToolApprovalCard } from "./ActionCards";
import type { PendingAction } from "../../types";

afterEach(cleanup);

const render = (ui: ReactElement) =>
  rtlRender(<ChatI18nProvider locale="en">{ui}</ChatI18nProvider>);

type Approval = Extract<PendingAction, { type: "tool_approval" }>;
type Question = Extract<PendingAction, { type: "user_question" }>;

const approval: Approval = {
  id: "a1",
  type: "tool_approval",
  toolName: "sandbox_exec",
  args: { command: "rm -rf build" },
};

describe("ToolApprovalCard", () => {
  it("hides arguments until Details is opened", () => {
    render(<ToolApprovalCard action={approval} onResolve={() => {}} />);
    expect(screen.queryByText(/rm -rf build/)).toBeNull();
    const toggle = screen.getByRole("button", { name: "Details" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/rm -rf build/)).toBeTruthy();
  });

  it("approves and remembers for the session", () => {
    const onResolve = vi.fn();
    render(<ToolApprovalCard action={approval} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onResolve).toHaveBeenCalledWith({
      type: "tool_approval",
      decision: "allow",
      rememberForSession: true,
    });
  });

  it("denies with an optional reason", () => {
    const onResolve = vi.fn();
    render(<ToolApprovalCard action={approval} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a reason" }));
    fireEvent.change(screen.getByPlaceholderText("Reason (optional)"), { target: { value: "too risky" } });
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onResolve).toHaveBeenCalledWith({ type: "tool_approval", decision: "deny", comment: "too risky" });
  });

  it("shows a notice instead of buttons when read-only", () => {
    render(<ToolApprovalCard action={approval} readOnly onResolve={() => {}} />);
    expect(screen.getByText("Waiting for approval in another app")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("shows the outcome once resolved", () => {
    render(
      <ToolApprovalCard
        action={approval}
        state={{ status: "resolved", resolution: { type: "tool_approval", decision: "deny", comment: "no" } }}
        onResolve={() => {}}
      />
    );
    expect(screen.getByText(/Denied/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("QuestionCard", () => {
  const single: Question = {
    id: "q1",
    type: "user_question",
    questions: [
      { question: "Which environment?", header: "Env", options: [{ label: "Staging", value: "stg" }, { label: "Production" }] },
    ],
  };

  it("submits a lone single-choice question as soon as an option is picked", () => {
    const onResolve = vi.fn();
    render(<QuestionCard action={single} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole("button", { name: /Staging/ }));
    expect(onResolve).toHaveBeenCalledWith({
      type: "user_question",
      answers: { "Which environment?": "stg" },
    });
  });

  it("collects multi-select answers and sends them on Send", () => {
    const onResolve = vi.fn();
    const multi: Question = {
      id: "q2",
      type: "user_question",
      questions: [
        { question: "Which regions?", multiSelect: true, required: true, options: [{ label: "EU" }, { label: "US" }] },
      ],
    };
    render(<QuestionCard action={multi} onResolve={onResolve} />);
    const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    // required: no Skip
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    fireEvent.click(screen.getByLabelText("EU"));
    fireEvent.click(screen.getByLabelText("US"));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onResolve).toHaveBeenCalledWith({
      type: "user_question",
      answers: { "Which regions?": ["EU", "US"] },
    });
  });

  it("sends free text with Enter and offers Skip when nothing is required", () => {
    const onResolve = vi.fn();
    const free: Question = {
      id: "q3",
      type: "user_question",
      allowFreeText: true,
      questions: [{ question: "Any notes?" }],
    };
    render(<QuestionCard action={free} onResolve={onResolve} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "ship it" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    expect(onResolve).toHaveBeenCalledWith({ type: "user_question", answers: { "Any notes?": "ship it" } });

    onResolve.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onResolve).toHaveBeenCalledWith({ type: "user_question", answers: {}, cancelled: true });
  });

  it("shows the given answer once resolved", () => {
    render(
      <QuestionCard
        action={single}
        state={{
          status: "resolved",
          resolution: { type: "user_question", answers: { "Which environment?": "Staging" } },
        }}
        onResolve={() => {}}
      />
    );
    expect(screen.getByText("Staging")).toBeTruthy();
    expect(screen.getByText("Answered")).toBeTruthy();
  });
});
