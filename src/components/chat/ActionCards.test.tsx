import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
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

  it("sends free text with Enter and offers Skip when no question is required", () => {
    const onResolve = vi.fn();
    const free: Question = {
      id: "q3",
      type: "user_question",
      allowFreeText: true,
      questions: [{ question: "Any notes?", required: false }],
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

describe("QuestionCard: a question is required unless the server says required: false", () => {
  const plain: Question = { id: "p", type: "user_question", questions: [{ question: "Which team?", options: [{ label: "A" }, { label: "B" }], multiSelect: true }] };

  it("marks a question without `required` as required: asterisk, no Skip, Send waits for an answer", () => {
    render(<QuestionCard action={plain} onResolve={() => {}} />);
    expect(screen.getByLabelText("Required")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("treats required: true the same, and required: false as optional", () => {
    const optional: Question = { ...plain, id: "o", questions: [{ ...plain.questions[0], required: false }] };
    const { unmount } = render(<QuestionCard action={optional} onResolve={() => {}} />);
    expect(screen.queryByLabelText("Required")).toBeNull();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    unmount();

    const explicit: Question = { ...plain, id: "e", questions: [{ ...plain.questions[0], required: true }] };
    render(<QuestionCard action={explicit} onResolve={() => {}} />);
    expect(screen.getByLabelText("Required")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("offers Skip only when every question is optional, and holds Send until the required ones are answered", () => {
    const onResolve = vi.fn();
    const mixed: Question = {
      id: "m",
      type: "user_question",
      questions: [
        { question: "Region?", options: [{ label: "EU" }, { label: "US" }], multiSelect: true },
        { question: "Notes?", required: false },
      ],
    };
    render(<QuestionCard action={mixed} onResolve={onResolve} />);
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();

    // answering only the optional question is not enough (the SDK would refuse the partial answer)
    fireEvent.change(screen.getByRole("textbox", { name: "Notes?" }), { target: { value: "none" } });
    const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("EU"));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onResolve).toHaveBeenCalledWith({ type: "user_question", answers: { "Region?": ["EU"], "Notes?": "none" } });
  });
});

describe("ToolApprovalCard: editing the arguments", () => {
  const withSchema: Approval = {
    ...approval,
    argsSchema: {
      type: "object",
      required: ["command"],
      properties: { command: { type: "string" }, timeout: { type: "integer", minimum: 1 } },
      additionalProperties: false,
    },
    args: { command: "rm -rf build", timeout: 30 },
  };
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Edit arguments" }));
  const editor = () => screen.getByRole("textbox", { name: "Arguments (JSON)" }) as HTMLTextAreaElement;
  const approve = () => screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;

  it("is off by default: Details is read-only", () => {
    render(<ToolApprovalCard action={withSchema} onResolve={() => {}} />);
    expect(screen.queryByRole("button", { name: "Edit arguments" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.queryByRole("textbox", { name: "Arguments (JSON)" })).toBeNull();
  });

  it("sends no approvedArgs when the arguments were not changed", () => {
    const onResolve = vi.fn();
    render(<ToolApprovalCard action={withSchema} allowArgumentEdit onResolve={onResolve} />);
    open();
    expect(JSON.parse(editor().value)).toEqual(withSchema.args);
    fireEvent.click(approve());
    expect(onResolve).toHaveBeenCalledWith({ type: "tool_approval", decision: "allow" });
  });

  it("sends the edited arguments, flags the edit, and can reset it", () => {
    const onResolve = vi.fn();
    render(<ToolApprovalCard action={withSchema} allowArgumentEdit onResolve={onResolve} />);
    open();
    fireEvent.change(editor(), { target: { value: '{"command":"rm -rf build/cache","timeout":30}' } });
    expect(screen.getByText("Arguments edited")).toBeTruthy();
    fireEvent.click(approve());
    expect(onResolve).toHaveBeenCalledWith({
      type: "tool_approval",
      decision: "allow",
      approvedArgs: { command: "rm -rf build/cache", timeout: 30 },
    });

    onResolve.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Reset arguments" }));
    expect(screen.queryByText("Arguments edited")).toBeNull();
    fireEvent.click(approve());
    expect(onResolve).toHaveBeenCalledWith({ type: "tool_approval", decision: "allow" });
  });

  it("does not treat a reordered but identical edit as an edit", () => {
    const onResolve = vi.fn();
    render(<ToolApprovalCard action={withSchema} allowArgumentEdit onResolve={onResolve} />);
    open();
    fireEvent.change(editor(), { target: { value: '{"timeout":30,"command":"rm -rf build"}' } });
    expect(screen.queryByText("Arguments edited")).toBeNull();
    fireEvent.click(approve());
    expect(onResolve).toHaveBeenCalledWith({ type: "tool_approval", decision: "allow" });
  });

  it("blocks Approve while the text is not a JSON object, and says why", () => {
    render(<ToolApprovalCard action={withSchema} allowArgumentEdit onResolve={() => {}} />);
    open();
    fireEvent.change(editor(), { target: { value: "{oops" } });
    expect(screen.getByText("This is not valid JSON")).toBeTruthy();
    expect(approve().disabled).toBe(true);
    expect(editor().getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(editor(), { target: { value: "[1]" } });
    expect(screen.getByText("The arguments must be a JSON object")).toBeTruthy();
    expect(approve().disabled).toBe(true);
  });

  it("checks the edit against the provided schema", () => {
    render(<ToolApprovalCard action={withSchema} allowArgumentEdit onResolve={() => {}} />);
    open();
    fireEvent.change(editor(), { target: { value: '{"timeout":0,"extra":true}' } });
    expect(screen.getByText("command is required")).toBeTruthy();
    expect(screen.getByText("timeout must be at least 1")).toBeTruthy();
    expect(screen.getByText("extra is not allowed")).toBeTruthy();
    expect(approve().disabled).toBe(true);

    fireEvent.change(editor(), { target: { value: '{"command":"ls"}' } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(approve().disabled).toBe(false);
  });

  it("says why Approve is off without opening the editor, and ties the reason to the button", () => {
    // the agent proposed a call that does not fit its own schema
    const proposed: Approval = { ...withSchema, args: { timeout: 0 } };
    render(<ToolApprovalCard action={proposed} allowArgumentEdit onResolve={() => {}} />);
    expect(screen.queryByRole("textbox", { name: "Arguments (JSON)" })).toBeNull();
    expect(screen.getByText("command is required")).toBeTruthy();
    expect(screen.getByText("timeout must be at least 1")).toBeTruthy();
    expect(approve().disabled).toBe(true);
    const reasons = screen.getByRole("alert");
    expect(approve().getAttribute("aria-describedby")).toBe(reasons.id);

    // opening the editor does not repeat them
    open();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(editor().getAttribute("aria-describedby")).toBe(reasons.id);

    fireEvent.change(editor(), { target: { value: '{"command":"ls"}' } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(approve().getAttribute("aria-describedby")).toBeNull();
    expect(approve().disabled).toBe(false);
  });

  it("still lets the person deny while the edit is invalid, without approvedArgs", () => {
    const onResolve = vi.fn();
    render(<ToolApprovalCard action={withSchema} allowArgumentEdit onResolve={onResolve} />);
    open();
    fireEvent.change(editor(), { target: { value: "{oops" } });
    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onResolve).toHaveBeenCalledWith({ type: "tool_approval", decision: "deny" });
  });

  it("has no editor for a call without arguments, or when read-only", () => {
    const { unmount } = render(<ToolApprovalCard action={{ ...approval, args: undefined }} allowArgumentEdit onResolve={() => {}} />);
    expect(screen.queryByRole("button", { name: "Edit arguments" })).toBeNull();
    unmount();
    render(<ToolApprovalCard action={withSchema} allowArgumentEdit readOnly onResolve={() => {}} />);
    expect(screen.queryByRole("button", { name: "Edit arguments" })).toBeNull();
  });

  it("shows the arguments that were approved, and the remembered badge, once settled", () => {
    render(
      <ToolApprovalCard
        action={withSchema}
        state={{
          status: "resolved",
          resolution: { type: "tool_approval", decision: "allow", approvedArgs: { command: "ls" }, rememberForSession: true },
        }}
        onResolve={() => {}}
      />
    );
    expect(screen.getByText("Approved with edited arguments")).toBeTruthy();
    expect(screen.getByText("Remembered for this chat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText(/"command": "ls"/)).toBeTruthy();
    expect(screen.queryByText(/rm -rf build/)).toBeNull();
  });
});

describe("settled cards read as what they are", () => {
  it.each([
    ["resolved", { type: "tool_approval" as const, decision: "allow" as const }, "Approved", "text-chat-success"],
    ["resolved", { type: "tool_approval" as const, decision: "deny" as const }, "Denied", "text-chat-danger"],
    ["expired", undefined, "Expired", "text-chat-warning"],
    ["cancelled", undefined, "Cancelled", "text-chat-text-tertiary"],
  ] as const)("%s / %j shows %s in its tone", (status, resolution, text, tone) => {
    render(<ToolApprovalCard action={approval} state={{ status, resolution }} onResolve={() => {}} />);
    const outcome = screen.getByText(text).closest('[role="status"]') as HTMLElement;
    expect(outcome.querySelector("svg")?.getAttribute("class")).toContain(tone);
  });
});

describe("deadlines", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (ms: number) => new Date(Date.now() + ms).toISOString();

  it("counts down, turns amber near the deadline, and expires the card at it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    const onResolve = vi.fn();
    render(<ToolApprovalCard action={{ ...approval, expiresAt: at(3 * 3600_000) }} onResolve={onResolve} />);

    const countdown = () => screen.getByText(/^Expires /);
    expect(countdown().textContent).toBe("Expires in 3 hours");
    expect(countdown().className).not.toContain("text-chat-warning");

    act(() => {
      vi.advanceTimersByTime(3 * 3600_000 - 9 * 60_000);
    });
    expect(countdown().textContent).toBe("Expires in 9 minutes");
    expect(countdown().className).toContain("text-chat-warning");

    act(() => {
      vi.advanceTimersByTime(9 * 60_000);
    });
    expect(screen.queryByText(/^Expires /)).toBeNull();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("uses the warning threshold it is given", () => {
    vi.useFakeTimers();
    render(<ToolApprovalCard action={{ ...approval, expiresAt: at(30 * 60_000) }} expiryWarningSeconds={3600} onResolve={() => {}} />);
    expect(screen.getByText(/^Expires /).className).toContain("text-chat-warning");
  });

  it("shows an already passed deadline as expired at once, for a question too", () => {
    vi.useFakeTimers();
    const past: Question = { id: "q", type: "user_question", questions: [{ question: "Which?" }], expiresAt: at(-1000) };
    render(<QuestionCard action={past} onResolve={() => {}} />);
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  it("shows no countdown for a request without a deadline or one that is settled", () => {
    const { unmount } = render(<ToolApprovalCard action={approval} onResolve={() => {}} />);
    expect(screen.queryByText(/^Expires /)).toBeNull();
    unmount();
    render(
      <ToolApprovalCard
        action={{ ...approval, expiresAt: new Date(Date.now() + 3600_000).toISOString() }}
        state={{ status: "resolved", resolution: { type: "tool_approval", decision: "allow" } }}
        onResolve={() => {}}
      />
    );
    expect(screen.queryByText(/^Expires /)).toBeNull();
  });
});

describe("focus on a card that just appeared", () => {
  it("moves a question's focus to its first control", () => {
    const q: Question = { id: "q", type: "user_question", questions: [{ question: "Which?", options: [{ label: "A" }, { label: "B" }], multiSelect: true }] };
    render(<QuestionCard action={q} autoFocus onResolve={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText("A"));
  });

  it("puts an approval's focus on the card, never on a button that decides", () => {
    render(<ToolApprovalCard action={approval} autoFocus onResolve={() => {}} />);
    const card = screen.getByRole("group");
    expect(document.activeElement).toBe(card);
  });

  it("leaves focus alone when the person is typing", () => {
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    input.focus();
    render(<ToolApprovalCard action={approval} autoFocus onResolve={() => {}} />);
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it("does not take focus unless asked", () => {
    render(<ToolApprovalCard action={approval} onResolve={() => {}} />);
    expect(document.activeElement).toBe(document.body);
  });
});
