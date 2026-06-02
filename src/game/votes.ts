import type { VoteState } from "./types";

export type VoteTotals = {
  approve: number;
  reject: number;
};

export type VoteDecision = "approved" | "rejected" | "pending";

export function getRequiredApproveVotes(playerCount: number): number {
  return Math.floor(playerCount / 2) + 1;
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

export function getVoteDecision(vote: VoteState): VoteDecision {
  const totals = countVoteTotals(vote);
  if (totals.approve >= vote.requiredApproveVotes) return "approved";
  if (totals.reject >= vote.requiredApproveVotes) return "rejected";

  const allEligiblePlayersVoted = vote.eligibleVoterIds.every((playerId) => vote.votes[playerId]);
  if (allEligiblePlayersVoted) return "rejected";

  return "pending";
}
