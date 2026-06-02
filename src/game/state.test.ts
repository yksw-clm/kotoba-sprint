import { describe, expect, it } from "vitest";
import { createInitialGameState, canStartGame, refreshHost, sortRoundAnswers } from "./state";
import type { Player, RoundAnswer, VoteState } from "./types";
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

  it("calculates strict majority from eligible voters", () => {
    expect(getRequiredApproveVotes(1)).toBe(1);
    expect(getRequiredApproveVotes(2)).toBe(2);
    expect(getRequiredApproveVotes(3)).toBe(2);
    expect(getRequiredApproveVotes(4)).toBe(3);
  });

  it("sorts candidates by length and then first submission", () => {
    const answers: RoundAnswer[] = [
      { answerId: "a", playerId: "a", word: "かり", length: 2, submittedAt: 2 },
      { answerId: "b", playerId: "b", word: "かざり", length: 3, submittedAt: 3 },
      { answerId: "c", playerId: "c", word: "かおり", length: 3, submittedAt: 1 },
    ];

    expect(sortRoundAnswers(answers).map((answer) => answer.answerId)).toEqual(["c", "b", "a"]);
  });

  it("approves once a majority of eligible voters approves", () => {
    const vote: VoteState = {
      answerId: "answer",
      word: "かざり",
      answerPlayerId: "a",
      startedAt: 1,
      deadlineAt: 2,
      requiredApproveVotes: 2,
      eligibleVoterIds: ["b", "c", "d"],
      answerLength: 3,
      candidateIndex: 1,
      totalCandidates: 2,
      rejectedAnswerIds: [],
      votes: { b: "approve", c: "approve" },
    };

    expect(getVoteDecision(vote)).toBe("approved");
  });

  it("rejects once a majority of eligible voters rejects", () => {
    const vote: VoteState = {
      answerId: "answer",
      word: "かざり",
      answerPlayerId: "a",
      startedAt: 1,
      deadlineAt: 2,
      requiredApproveVotes: 2,
      eligibleVoterIds: ["b", "c", "d"],
      answerLength: 3,
      candidateIndex: 1,
      totalCandidates: 2,
      rejectedAnswerIds: [],
      votes: { b: "reject", c: "reject" },
    };

    expect(getVoteDecision(vote)).toBe("rejected");
  });

  it("rejects a tie after all eligible voters vote without approval majority", () => {
    const vote: VoteState = {
      answerId: "answer",
      word: "かざり",
      answerPlayerId: "a",
      startedAt: 1,
      deadlineAt: 2,
      requiredApproveVotes: 2,
      eligibleVoterIds: ["b", "c"],
      answerLength: 3,
      candidateIndex: 1,
      totalCandidates: 2,
      rejectedAnswerIds: [],
      votes: { b: "approve", c: "reject" },
    };

    expect(getVoteDecision(vote)).toBe("rejected");
  });
});
