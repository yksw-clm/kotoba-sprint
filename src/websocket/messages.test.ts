import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./messages";

describe("websocket messages", () => {
  it("parses restart game messages", () => {
    expect(parseClientMessage({ type: "restart_game" })).toEqual({ type: "restart_game" });
  });
});
