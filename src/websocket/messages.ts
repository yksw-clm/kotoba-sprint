import type { PublicGameState, PublicPlayerState, PublicRoundState, VoteValue } from "../game/types";

export type ClientMessage =
  | JoinRoomMessage
  | StartGameMessage
  | SubmitAnswerMessage
  | SubmitVoteMessage;

export type JoinRoomMessage = {
  type: "join_room";
  name: string;
};

export type StartGameMessage = {
  type: "start_game";
};

export type SubmitAnswerMessage = {
  type: "submit_answer";
  word: string;
};

export type SubmitVoteMessage = {
  type: "submit_vote";
  answerId: string;
  vote: VoteValue;
};

export type AnswerRejectedReason =
  | "not_playing"
  | "already_voting"
  | "invalid_format"
  | "not_joined"
  | "no_condition";

export type ServerMessage =
  | RoomStateMessage
  | YouJoinedMessage
  | GameStartedMessage
  | RoundStartedMessage
  | AnswerRejectedMessage
  | VoteStartedMessage
  | VoteUpdatedMessage
  | VoteRejectedMessage
  | RoundFinishedMessage
  | GameFinishedMessage
  | ErrorMessage;

export type RoomStateMessage = {
  type: "room_state";
  state: PublicGameState;
  youPlayerId: string | null;
};

export type YouJoinedMessage = {
  type: "you_joined";
  playerId: string;
  name: string;
};

export type GameStartedMessage = {
  type: "game_started";
  state: PublicGameState;
};

export type RoundStartedMessage = {
  type: "round_started";
  round: PublicRoundState;
  players: PublicPlayerState[];
};

export type AnswerRejectedMessage = {
  type: "answer_rejected";
  reason: AnswerRejectedReason;
};

export type VoteStartedMessage = {
  type: "vote_started";
  answerId: string;
  answerPlayerId: string;
  answerPlayerName: string;
  word: string;
  requiredApproveVotes: number;
  approveVotes: number;
  rejectVotes: number;
};

export type VoteUpdatedMessage = {
  type: "vote_updated";
  answerId: string;
  approveVotes: number;
  rejectVotes: number;
  requiredApproveVotes: number;
};

export type VoteRejectedMessage = {
  type: "vote_rejected";
  answerId: string;
  word: string;
};

export type RoundFinishedMessage = {
  type: "round_finished";
  winnerPlayerId: string | null;
  winnerPlayerName: string | null;
  word: string | null;
  scores: Record<string, number>;
};

export type GameFinishedMessage = {
  type: "game_finished";
  winnerPlayerId: string;
  winnerPlayerName: string;
  scores: Record<string, number>;
};

export type ErrorMessage = {
  type: "error";
  message: string;
};

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "join_room":
      if (typeof value.name !== "string") return null;
      return { type: "join_room", name: value.name };
    case "start_game":
      return { type: "start_game" };
    case "submit_answer":
      if (typeof value.word !== "string") return null;
      return { type: "submit_answer", word: value.word };
    case "submit_vote":
      if (
        typeof value.answerId !== "string" ||
        (value.vote !== "approve" && value.vote !== "reject")
      ) {
        return null;
      }
      return { type: "submit_vote", answerId: value.answerId, vote: value.vote };
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
