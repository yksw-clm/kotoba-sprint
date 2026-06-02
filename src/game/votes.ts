import type { VoteState } from "./types";

export type VoteTotals = {
  approve: number;
  reject: number;
};

export type VoteDecision = "approved" | "rejected" | "pending";

export function getRequiredApproveVotes(playerCount: number): number {
  if (playerCount <= 2) return 1;
  return 3;
}

export function countVoteTotals(vote: VoteState): VoteTotals {
  return Object.values(vote.votes).reduce<VoteTotals>(
    (totals, value) => {
      if (value === "approve") {
        totals.approve += 1;
      } else {
        totals.reject += 1;
      }
      return totals;
    },
    { approve: 0, reject: 0 },
  );
}

export function getVoteDecision(vote: VoteState, connectedPlayerIds: string[]): VoteDecision {
  const totals = countVoteTotals(vote);
  if (totals.approve >= vote.requiredApproveVotes) return "approved";

  const allConnectedPlayersVoted = connectedPlayerIds.every((playerId) => vote.votes[playerId]);
  if (allConnectedPlayersVoted) return "rejected";

  return "pending";
}
