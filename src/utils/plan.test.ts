import { describe, expect, it } from "vitest";
import {
  emptyTurnFlow,
  flowCompaction,
  flowMetadata,
  flowPlan,
  flowToolEnd,
  flowToolStart,
  normalizePlan,
  planProgress,
  readActivity,
  readPlan,
  toolResultFailed,
  turnPlanOf,
} from "./plan";
import type { PlanSnapshot } from "../types";

const plan = (...statuses: Array<PlanSnapshot["steps"][number]["status"]>): PlanSnapshot => ({
  steps: statuses.map((status, i) => ({ id: i + 1, title: `Step ${i + 1}`, status })),
});

describe("normalizePlan", () => {
  it("keeps titles, status, ids and the version, and nothing else", () => {
    const read = normalizePlan({
      version: 3,
      owner: "x",
      steps: [
        { id: "a", title: " Look up ", status: "completed", exitCriteria: "secret", evidence: ["e"] },
        { id: 2, title: "Decide", status: "in-progress" },
        { title: "No id", status: "blocked" },
      ],
    });
    expect(read).toEqual({
      version: 3,
      steps: [
        { id: "a", title: "Look up", status: "completed" },
        { id: 2, title: "Decide", status: "in-progress" },
        { title: "No id", status: "blocked" },
      ],
    });
  });

  it("keeps what the agent did to the plan, and drops a word it does not know", () => {
    const steps = [{ title: "A", status: "completed" }];
    expect(normalizePlan({ operation: "write", steps })).toEqual({ operation: "write", steps });
    expect(normalizePlan({ version: 2, operation: "update", steps })).toEqual({ version: 2, operation: "update", steps });
    // a newer server may say more than the chat knows: the plan still shows
    expect(normalizePlan({ operation: "rewrite", steps })).toEqual({ steps });
    expect(normalizePlan({ operation: 3, steps })).toEqual({ steps });
    expect(normalizePlan({ steps })).toEqual({ steps });
  });

  it("drops a step without a title, reads an unknown status as not started, and cuts long input", () => {
    const read = normalizePlan({
      steps: [{ title: "", status: "completed" }, { title: 5 }, "nope", { title: "Odd", status: "paused" }, { title: "x".repeat(600), status: "completed" }],
    });
    expect(read?.steps).toHaveLength(2);
    expect(read?.steps[0]).toEqual({ title: "Odd", status: "not-started" });
    expect(read?.steps[1]!.title.length).toBe(500);
    const many = normalizePlan({ steps: Array.from({ length: 150 }, (_, i) => ({ title: `s${i}`, status: "not-started" })) });
    expect(many?.steps).toHaveLength(100);
  });

  it("is undefined when there is nothing to show", () => {
    expect(normalizePlan(undefined)).toBeUndefined();
    expect(normalizePlan("plan")).toBeUndefined();
    expect(normalizePlan({ steps: [] })).toBeUndefined();
    expect(normalizePlan({ steps: [{ status: "completed" }] })).toBeUndefined();
    expect(normalizePlan({ steps: "x" })).toBeUndefined();
  });
});

describe("planProgress", () => {
  it("counts completed steps and finds the one in progress", () => {
    const p = plan("completed", "in-progress", "not-started");
    const progress = planProgress(p);
    expect(progress).toMatchObject({ done: 1, total: 3, complete: false });
    expect(progress.current?.title).toBe("Step 2");
  });

  it("is complete only when every step is", () => {
    expect(planProgress(plan("completed", "completed")).complete).toBe(true);
    expect(planProgress(plan("completed", "blocked")).complete).toBe(false);
    expect(planProgress({ steps: [] }).complete).toBe(false);
  });
});

describe("readPlan / readActivity", () => {
  it("reads what a stored message carries", () => {
    const metadata = {
      plan: { steps: [{ title: "A", status: "completed" }] },
      activity: [
        { kind: "tool", id: "t1", name: "search", label: "Web Search", status: "ok" },
        { kind: "plan", version: 1, done: 0, total: 5, created: true },
        { kind: "compaction", id: "c1" },
      ],
    };
    expect(readPlan({ metadata })?.steps[0]!.title).toBe("A");
    expect(readActivity({ metadata })).toEqual(metadata.activity);
  });

  it("leaves out entries that do not read as one, and is undefined without any", () => {
    expect(
      readActivity({ metadata: { activity: [null, "x", { kind: "tool" }, { kind: "plan", done: "1", total: 2 }, { kind: "other" }, { kind: "tool", name: "ok", status: "weird" }] } })
    ).toEqual([{ kind: "tool", name: "ok" }]);
    expect(readActivity({ metadata: { activity: [] } })).toBeUndefined();
    expect(readActivity({ metadata: { activity: "x" } })).toBeUndefined();
    expect(readActivity({})).toBeUndefined();
    expect(readPlan({ metadata: { plan: { steps: [] } } })).toBeUndefined();
  });
});

describe("toolResultFailed", () => {
  it("reads the shapes a failure has", () => {
    expect(toolResultFailed({ ok: false })).toBe(true);
    expect(toolResultFailed({ error: "boom" })).toBe(true);
    expect(toolResultFailed({ isError: true })).toBe(true);
    expect(toolResultFailed({ ok: true })).toBe(false);
    expect(toolResultFailed({ error: "" })).toBe(false);
    expect(toolResultFailed("text")).toBe(false);
    expect(toolResultFailed(undefined)).toBe(false);
  });
});

describe("turn flow", () => {
  it("records calls, plan changes and condensing in arrival order", () => {
    let flow = emptyTurnFlow();
    flow = flowToolStart(flow, { id: "t1", name: "lookup", label: "Look up customer" });
    flow = flowToolEnd(flow, "t1", false);
    flow = flowPlan(flow, plan("not-started", "not-started"));
    flow = flowToolStart(flow, { id: "t2", name: "search" });
    flow = flowCompaction(flow, "c1");
    flow = flowToolEnd(flow, "t2", true);
    flow = flowPlan(flow, plan("completed", "in-progress"));
    expect(flow.activity).toEqual([
      { kind: "tool", id: "t1", name: "lookup", label: "Look up customer", status: "ok" },
      { kind: "plan", done: 0, total: 2, created: true },
      { kind: "tool", id: "t2", name: "search", status: "error" },
      { kind: "compaction", id: "c1" },
      { kind: "plan", done: 1, total: 2 },
    ]);
    expect(flow.plan?.steps[0]!.status).toBe("completed");
  });

  it("does not repeat a call, a pass or a plan that looks the same", () => {
    let flow = flowToolStart(emptyTurnFlow(), { id: "t1", name: "n" });
    flow = flowToolStart(flow, { id: "t1", name: "n" });
    expect(flow.activity).toHaveLength(1);
    // a later frame may bring the label
    flow = flowToolStart(flow, { id: "t1", name: "n", label: "Nicer" });
    expect(flow.activity[0]).toMatchObject({ label: "Nicer" });
    flow = flowCompaction(flow, "c1");
    expect(flowCompaction(flow, "c1")).toBe(flow);
    // without an id every pass counts
    expect(flowCompaction(flowCompaction(emptyTurnFlow()), undefined).activity).toHaveLength(2);
    const planned = flowPlan(emptyTurnFlow(), plan("in-progress"));
    expect(flowPlan(planned, { ...plan("in-progress"), version: 9 })).toBe(planned);
    expect(flowPlan(planned, undefined)).toBe(planned);
  });

  it("ignores the end of a call it never saw", () => {
    const flow = emptyTurnFlow();
    expect(flowToolEnd(flow, "nope", false)).toBe(flow);
  });

  it("a leg that carries on a paused turn updates the plan it had instead of creating one", () => {
    const flow = flowPlan(emptyTurnFlow(plan("completed", "in-progress")), plan("completed", "completed"));
    expect(flow.activity).toEqual([{ kind: "plan", done: 2, total: 2 }]);
  });

  it("believes what a frame says it did over what the turn has shown so far", () => {
    // the first plan this turn shows only changes one the agent wrote in an earlier turn
    const updated = flowPlan(emptyTurnFlow(), { ...plan("in-progress", "not-started"), operation: "update" });
    expect(updated.activity).toEqual([{ kind: "plan", done: 0, total: 2 }]);
    // a plan the agent writes out again (it started over) is a creation, though the turn had one
    const restarted = flowPlan(updated, { ...plan("not-started", "not-started", "not-started"), operation: "write" });
    expect(restarted.activity[1]).toEqual({ kind: "plan", done: 0, total: 3, created: true });
    expect(flowPlan(emptyTurnFlow(), { ...plan("in-progress"), operation: "write" }).activity).toEqual([{ kind: "plan", done: 0, total: 1, created: true }]);
    // the word wins over a plan the leg started with, too
    expect(flowPlan(emptyTurnFlow(plan("completed", "in-progress")), { ...plan("not-started"), operation: "write" }).activity).toEqual([
      { kind: "plan", done: 0, total: 1, created: true },
    ]);
  });

  it("goes by the turn so far when the frame says nothing about it", () => {
    const first = flowPlan(emptyTurnFlow(), plan("in-progress", "not-started"));
    expect(first.activity).toEqual([{ kind: "plan", done: 0, total: 2, created: true }]);
    expect(flowPlan(first, plan("completed", "in-progress")).activity[1]).toEqual({ kind: "plan", done: 1, total: 2 });
    // a leg that carries a paused turn on starts with the plan the turn had: its first write is an update
    expect(flowPlan(emptyTurnFlow(plan("in-progress")), plan("completed")).activity).toEqual([{ kind: "plan", done: 1, total: 1 }]);
  });

  it("keeps the plan with the answer only when this leg wrote or changed it", () => {
    const seeded = emptyTurnFlow(plan("completed", "in-progress"));
    // the leg carried the plan on and did other things: the paused message already holds the plan
    const worked = flowToolEnd(flowToolStart(seeded, { id: "t", name: "n" }), "t", false);
    expect(flowMetadata(seeded)).toEqual({});
    expect(flowMetadata(worked)).toEqual({ activity: worked.activity });
    expect(Object.keys(flowMetadata(worked))).toEqual(["activity"]);
    // the same plan again is not a change
    expect(flowMetadata(flowPlan(worked, plan("completed", "in-progress")))).toEqual({ activity: worked.activity });
    // a change is
    const changed = flowPlan(worked, plan("completed", "completed"));
    expect(changed.planChanged).toBe(true);
    expect(flowMetadata(changed)).toEqual({ plan: changed.plan, activity: changed.activity });
    // and so is the first plan of a turn that started with none
    const first = flowPlan(emptyTurnFlow(), plan("in-progress"));
    expect(flowMetadata(first).plan).toBe(first.plan);
    // the flag survives the entries that follow
    expect(flowMetadata(flowCompaction(flowToolStart(changed, { id: "u", name: "n" }), "c")).plan).toBe(changed.plan);
  });

  it("writes metadata only for what happened", () => {
    expect(flowMetadata(emptyTurnFlow())).toEqual({});
    const flow = flowPlan(flowToolStart(emptyTurnFlow(), { id: "t", name: "n" }), plan("in-progress"));
    expect(flowMetadata(flow)).toEqual({ plan: flow.plan, activity: flow.activity });
    expect(Object.keys(flowMetadata(flowToolStart(emptyTurnFlow(), { id: "t", name: "n" })))).toEqual(["activity"]);
  });
});

describe("turnPlanOf", () => {
  const assistant = (metadata?: Record<string, unknown>) => ({ role: "assistant" as const, metadata });
  const user = { role: "user" as const, metadata: undefined };

  it("is the newest plan among the assistant messages after the last user message", () => {
    const old = { plan: { steps: [{ title: "Old", status: "completed" }] } };
    const mine = { plan: { steps: [{ title: "Mine", status: "in-progress" }] } };
    expect(turnPlanOf([assistant(old), user, assistant(), assistant(mine)])?.steps[0]!.title).toBe("Mine");
  });

  it("does not take the plan of an earlier turn", () => {
    expect(turnPlanOf([assistant({ plan: { steps: [{ title: "Old", status: "completed" }] } }), user, assistant()])).toBeUndefined();
    expect(turnPlanOf([])).toBeUndefined();
  });
});
