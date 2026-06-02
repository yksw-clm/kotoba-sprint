import { describe, expect, it } from "vitest";
import { createInitialGameState, canStartGame, refreshHost } from "./state";
import type { Player, VoteState } from "./types";
import { getRequiredApproveVotes, getVoteDecision } from "./votes";

function player(id: string, connected = true): Player {
  return {
    id,
    name: id,
    score: 0,
    connected,
    startChar: null,
    endChar: null,
    joinedAt: id.charCodeAt(0),
  };
}

describe("game state helpers", () => {
  it("requires the host and two connected players to start", () => {
    const state = createInitialGameState("room");
    state.players.a = player("a");
    state.players.b = player("b");
    state.hostPlayerId = "a";

    expect(canStartGame(state, "a")).toBe(true);
    expect(canStartGame(state, "b")).toBe(false);
  });

  it("hands host to the next connected player", () => {
    const state = createInitialGameState("room");
    state.players.a = player("a", false);
    state.players.b = player("b", true);
    state.hostPlayerId = "a";

    refreshHost(state);

    expect(state.hostPlayerId).toBe("b");
  });

  it("uses one approve vote for two-player games", () => {
    expect(getRequiredApproveVotes(2)).toBe(1);
    expect(getRequiredApproveVotes(5)).toBe(3);
  });

  it("approves once required approve votes are reached", () => {
    const vote: VoteState = {
      answerId: "answer",
      word: "かざり",
      answerPlayerId: "a",
      startedAt: 1,
      deadlineAt: 2,
      requiredApproveVotes: 3,
      votes: { a: "approve", b: "approve", c: "approve" },
    };

    expect(getVoteDecision(vote, ["a", "b", "c", "d"])).toBe("approved");
  });

  it("rejects after every connected player voted without enough approvals", () => {
    const vote: VoteState = {
      answerId: "answer",
      word: "かざり",
      answerPlayerId: "a",
      startedAt: 1,
      deadlineAt: 2,
      requiredApproveVotes: 3,
      votes: { a: "approve", b: "reject", c: "reject" },
    };

    expect(getVoteDecision(vote, ["a", "b", "c"])).toBe("rejected");
  });
});
