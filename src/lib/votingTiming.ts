/** UMA VotingV2: commit and reveal phases are equal length (typically 1 day each). */
export const VOTE_PHASE_DURATION_SEC = 86_400;

export interface PhaseTiming {
  commitStart: number;
  commitEnd: number;
  revealStart: number;
  revealEnd: number;
  currentPhaseStart: number;
  currentPhaseEnd: number;
  remainingSeconds: number;
}

/**
 * Derive commit/reveal windows from round end time.
 * `roundEndTime` from VotingV2 is the end of the reveal phase for `roundId`.
 */
export function computePhaseTiming(
  votePhase: number,
  roundEndTime: number,
  nowSec = Math.floor(Date.now() / 1000)
): PhaseTiming | null {
  if (!roundEndTime) return null;

  const revealEnd = roundEndTime;
  const revealStart = revealEnd - VOTE_PHASE_DURATION_SEC;
  const commitEnd = revealStart;
  const commitStart = commitEnd - VOTE_PHASE_DURATION_SEC;
  const isCommit = votePhase === 0;

  const currentPhaseStart = isCommit ? commitStart : revealStart;
  const currentPhaseEnd = isCommit ? commitEnd : revealEnd;
  const remainingSeconds = Math.max(0, currentPhaseEnd - nowSec);

  return {
    commitStart,
    commitEnd,
    revealStart,
    revealEnd,
    currentPhaseStart,
    currentPhaseEnd,
    remainingSeconds,
  };
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h ${m}m` : `${d}d ${m}m`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}
