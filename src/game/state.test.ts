import { describe, expect, it } from "vitest";
import {
  createInitialGameState,
  canStartGame,
  refreshHost,
  resetGameToWaiting,
  shouldReplaceBestAnswer,
  sortRoundAnswers,
} from "./state";
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
  it("creates default game settings", () => {
    const state = createInitialGameState("room");

    expect(state.targetScore).toBe(30);
    expect(state.roundTimeSeconds).toBe(60);
  });

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

  it("replaces a player's best answer when the new answer has the same length", () => {
    const current: RoundAnswer = {
      answerId: "old",
      playerId: "a",
      word: "すかっしゅ",
      length: 5,
      submittedAt: 1,
    };
    const sameLengthNext: RoundAnswer = {
      answerId: "new",
      playerId: "a",
      word: "すらっしゅ",
      length: 5,
      submittedAt: 2,
    };
    const shorterNext: RoundAnswer = {
      answerId: "short",
      playerId: "a",
      word: "すしゅ",
      length: 3,
      submittedAt: 3,
    };

    expect(shouldReplaceBestAnswer(current, sameLengthNext)).toBe(true);
    expect(shouldReplaceBestAnswer(current, shorterNext)).toBe(false);
  });

  it("resets a finished game to waiting for a rematch", () => {
    const state = createInitialGameState("room");
    state.targetScore = 100;
    state.roundTimeSeconds = 15;
    state.players.a = { ...player("a"), score: 30, startChar: "す", endChar: "ゆ" };
    state.players.b = { ...player("b"), score: 12, startChar: "す", endChar: "ゆ" };
    state.hostPlayerId = "a";
    state.status = "finished";
    state.round = {
      roundNumber: 4,
      startChar: "す",
      endChar: "ゆ",
      startedAt: 1,
      deadlineAt: 2,
      endedAt: 2,
      winnerPlayerId: "a",
      winningWord: "すかっしゅ",
      winningAnswerLength: 5,
      bestAnswers: {},
    };
    state.vote = {
      answerId: "answer",
      word: "すかっしゅ",
      answerPlayerId: "a",
      startedAt: 1,
      deadlineAt: 2,
      requiredApproveVotes: 1,
      eligibleVoterIds: ["b"],
      answerLength: 5,
      candidateIndex: 1,
      totalCandidates: 1,
      rejectedAnswerIds: [],
      votes: {},
    };
    state.nextRoundStartsAt = 3;

    resetGameToWaiting(state);

    expect(state.status).toBe("waiting");
    expect(state.round).toBeNull();
    expect(state.vote).toBeNull();
    expect(state.nextRoundStartsAt).toBeNull();
    expect(state.targetScore).toBe(100);
    expect(state.roundTimeSeconds).toBe(15);
    expect(Object.values(state.players).map((statePlayer) => statePlayer.score)).toEqual([0, 0]);
    expect(Object.values(state.players).map((statePlayer) => statePlayer.startChar)).toEqual([
      null,
      null,
    ]);
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
