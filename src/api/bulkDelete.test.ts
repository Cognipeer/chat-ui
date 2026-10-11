import { describe, expect, it } from "vitest";
import { readBulkDelete } from "./bulkDelete";

const ids = ["a", "b", "c"];

describe("readBulkDelete", () => {
  it("judges each id by its status when the server sends results", () => {
    const body = {
      results: [
        { id: "a", status: "deleted" },
        { id: "b", status: "busy", message: "running elsewhere" },
        { id: "c", status: "not_found" },
      ],
      deleted: 1,
    };
    expect(readBulkDelete(body, ids)).toEqual({
      deleted: ["a"],
      failed: [{ id: "b", code: "busy", message: "running elsewhere" }, { id: "c", code: "not_found" }],
    });
  });

  it("does not let the count override the per-id results", () => {
    // a count that says everything went does not turn a refusal into a deletion
    const body = { results: [{ id: "a", status: "deleted" }, { id: "b", status: "error" }, { id: "c", status: "deleted" }], deleted: 3 };
    expect(readBulkDelete(body, ids).deleted).toEqual(["a", "c"]);
  });

  it("reports an id the results leave out, an unknown status and a result for an id nobody asked for", () => {
    const body = { results: [{ id: "a", status: "deleted" }, { id: "b" }, { id: "zzz", status: "deleted" }, "junk", null] };
    expect(readBulkDelete(body, ids)).toEqual({ deleted: ["a"], failed: [{ id: "b", code: "error" }, { id: "c" }] });
  });

  it("counts an id once even if the results repeat it", () => {
    const body = { results: [{ id: "a", status: "deleted" }, { id: "a", status: "error" }, { id: "b", status: "deleted" }, { id: "c", status: "deleted" }] };
    expect(readBulkDelete(body, ids).deleted).toEqual(["a", "b", "c"]);
  });

  it("reads a bare count: all of them when it is all, none when it says nothing about which", () => {
    expect(readBulkDelete({ deleted: 3 }, ids)).toEqual({ deleted: ids, failed: [] });
    expect(readBulkDelete({ deleted: 0 }, ids)).toEqual({ deleted: [], failed: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(readBulkDelete({ deleted: 2 }, ids).deleted).toEqual([]);
  });

  it("reads a count together with the failures it lists", () => {
    expect(readBulkDelete({ deleted: 2, failed: [{ id: "b", code: "forbidden" }] }, ids)).toEqual({
      deleted: ["a", "c"],
      failed: [{ id: "b", code: "forbidden" }],
    });
  });

  it("still reads the older { deleted[], failed[] } answer", () => {
    expect(readBulkDelete({ deleted: ["a", "c"], failed: [{ id: "b", code: "forbidden", message: "no" }] }, ids)).toEqual({
      deleted: ["a", "c"],
      failed: [{ id: "b", code: "forbidden", message: "no" }],
    });
    // a listed deletion is believed; an unlisted id is not assumed gone
    expect(readBulkDelete({ deleted: ["a"] }, ids)).toEqual({ deleted: ["a"], failed: [{ id: "b" }, { id: "c" }] });
    expect(readBulkDelete({ failed: ["b"] }, ids)).toEqual({ deleted: ["a", "c"], failed: [{ id: "b" }] });
  });

  it("treats an answer that lists nothing as having deleted them all", () => {
    expect(readBulkDelete(undefined, ids)).toEqual({ deleted: ids, failed: [] });
    expect(readBulkDelete({}, ids)).toEqual({ deleted: ids, failed: [] });
  });
});
