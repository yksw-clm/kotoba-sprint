import { DEFAULT_TARGET_SCORE } from "./constants";
import type {
  GameState,
  Player,
  PublicGameState,
  PublicPlayerState,
  PublicRoundState,
  PublicVoteState,
  RoundAnswer,
} from "./types";
import { countVoteTotals } from "./votes";

export function createInitialGameState(
  roomId: string,
  targetScore = DEFAULT_TARGET_SCORE,
): GameState {
  return {
    status: "waiting",
    roomId,
    players: {},
    round: null,
    vote: null,
    targetScore,
    hostPlayerId: null,
    nextRoundStartsAt: null,
    createdAt: Date.now(),
  };
}

export function getPlayers(state: GameState): Player[] {
  return Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt);
}

export function getConnectedPlayers(state: GameState): Player[] {
  return getPlayers(state).filter((player) => player.connected);
}

export function getConnectedPlayerIds(state: GameState): string[] {
  return getConnectedPlayers(state).map((player) => player.id);
}

export function getConnectedPlayerCount(state: GameState): number {
  return getConnectedPlayers(state).length;
}

export function selectNextHostPlayerId(state: GameState): string | null {
  return getConnectedPlayers(state)[0]?.id ?? null;
}

export function refreshHost(state: GameState): void {
  const currentHost = state.hostPlayerId ? state.players[state.hostPlayerId] : null;
  if (!currentHost || !currentHost.connected) {
    state.hostPlayerId = selectNextHostPlayerId(state);
  }
}

export function canStartGame(state: GameState, playerId: string | null): boolean {
  return (
    state.status === "waiting" &&
    playerId !== null &&
    state.hostPlayerId === playerId &&
    getConnectedPlayerCount(state) >= 2
  );
}

export function clearPlayerConditions(state: GameState): void {
  for (const player of Object.values(state.players)) {
    player.startChar = null;
    player.endChar = null;
  }
}

export function toPublicGameState(state: GameState): PublicGameState {
  return {
    status: state.status,
    roomId: state.roomId,
    players: getPlayers(state).map(toPublicPlayerState),
    round: state.round ? toPublicRoundState(state.round) : null,
    vote: state.vote ? toPublicVoteState(state.vote) : null,
    targetScore: state.targetScore,
    hostPlayerId: state.hostPlayerId,
    nextRoundStartsAt: state.nextRoundStartsAt,
  };
}

function toPublicPlayerState(player: Player): PublicPlayerState {
  return {
    id: player.id,
    name: player.name,
    score: player.score,
    connected: player.connected,
    startChar: player.startChar,
    endChar: player.endChar,
  };
}

function toPublicRoundState(round: NonNullable<GameState["round"]>): PublicRoundState {
  return {
    roundNumber: round.roundNumber,
    startChar: round.startChar,
    endChar: round.endChar,
    startedAt: round.startedAt,
    deadlineAt: round.deadlineAt,
    winnerPlayerId: round.winnerPlayerId,
    winningWord: round.winningWord,
    winningAnswerLength: round.winningAnswerLength,
    bestAnswers: sortRoundAnswers(Object.values(round.bestAnswers)),
  };
}

function toPublicVoteState(vote: NonNullable<GameState["vote"]>): PublicVoteState {
  const totals = countVoteTotals(vote);
  return {
    answerId: vote.answerId,
    word: vote.word,
    answerPlayerId: vote.answerPlayerId,
    requiredApproveVotes: vote.requiredApproveVotes,
    eligibleVoterIds: vote.eligibleVoterIds,
    answerLength: vote.answerLength,
    candidateIndex: vote.candidateIndex,
    totalCandidates: vote.totalCandidates,
    rejectedAnswerIds: vote.rejectedAnswerIds,
    approveVotes: totals.approve,
    rejectVotes: totals.reject,
    votedPlayerIds: Object.keys(vote.votes),
    deadlineAt: vote.deadlineAt,
  };
}

export function sortRoundAnswers(answers: RoundAnswer[]): RoundAnswer[] {
  return [...answers].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a.submittedAt - b.submittedAt;
  });
}
