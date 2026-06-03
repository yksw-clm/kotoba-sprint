import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./messages";

describe("websocket messages", () => {
  it("parses start game messages with valid settings", () => {
    expect(
      parseClientMessage({
        type: "start_game",
        settings: { targetScore: 100, roundTimeSeconds: 15 },
      }),
    ).toEqual({
      type: "start_game",
      settings: { targetScore: 100, roundTimeSeconds: 15 },
    });
  });

  it("rejects start game messages with invalid settings", () => {
    expect(
      parseClientMessage({
        type: "start_game",
        settings: { targetScore: 14, roundTimeSeconds: 15 },
      }),
    ).toBeNull();
    expect(
      parseClientMessage({
        type: "start_game",
        settings: { targetScore: 30, roundTimeSeconds: 45 },
      }),
    ).toBeNull();
  });

  it("parses restart game messages", () => {
    expect(parseClientMessage({ type: "restart_game" })).toEqual({ type: "restart_game" });
  });
});
