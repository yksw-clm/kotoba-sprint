export type GameStatus = "waiting" | "playing" | "voting" | "round_result" | "finished";

export type Player = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  startChar: string | null;
  endChar: string | null;
  joinedAt: number;
};

export type RoundState = {
  roundNumber: number;
  length: number;
  startedAt: number;
  deadlineAt: number;
  endedAt: number | null;
  winnerPlayerId: string | null;
  winningWord: string | null;
};

export type VoteValue = "approve" | "reject";

export type VoteState = {
  answerId: string;
  word: string;
  answerPlayerId: string;
  startedAt: number;
  deadlineAt: number;
  requiredApproveVotes: number;
  votes: Record<string, VoteValue>;
};

export type GameState = {
  status: GameStatus;
  roomId: string;
  players: Record<string, Player>;
  round: RoundState | null;
  vote: VoteState | null;
  targetScore: number;
  hostPlayerId: string | null;
  nextRoundStartsAt: number | null;
  createdAt: number;
};

export type PublicPlayerState = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  startChar: string | null;
  endChar: string | null;
};

export type PublicRoundState = {
  roundNumber: number;
  length: number;
  startedAt: number;
  deadlineAt: number;
  winnerPlayerId: string | null;
  winningWord: string | null;
};

export type PublicVoteState = {
  answerId: string;
  word: string;
  answerPlayerId: string;
  requiredApproveVotes: number;
  approveVotes: number;
  rejectVotes: number;
  votedPlayerIds: string[];
  deadlineAt: number;
};

export type PublicGameState = {
  status: GameStatus;
  roomId: string;
  players: PublicPlayerState[];
  round: PublicRoundState | null;
  vote: PublicVoteState | null;
  targetScore: number;
  hostPlayerId: string | null;
  nextRoundStartsAt: number | null;
};
