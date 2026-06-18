import type { BenchmarkMode, BenchmarkRecord } from "./benchmarkHarness";

export type BenchmarkSuiteConfidence = "high" | "low" | "medium";
export type BenchmarkSuiteRecommendation = BenchmarkMode | "inconclusive";

export interface BenchmarkSuite {
  id: string;
  records: BenchmarkRecord[];
  taskName: string;
}

export interface BenchmarkSuiteComparison {
  confidence: BenchmarkSuiteConfidence;
  modesCompared: BenchmarkMode[];
  reason: string;
  recommendedMode: BenchmarkSuiteRecommendation;
}

export function createBenchmarkSuite(input: { id: string; records: BenchmarkRecord[]; taskName: string }): BenchmarkSuite {
  return {
    id: input.id,
    records: input.records,
    taskName: input.taskName
  };
}

function scoreRecord(record: BenchmarkRecord) {
  if (record.outcome !== "pass" || !record.first_pass_acceptance) {
    return Number.NEGATIVE_INFINITY;
  }
  const premiumScore = 1 - record.premium_token_ratio;
  const timeScore = record.wall_clock_seconds > 0 ? 1 / Math.log10(record.wall_clock_seconds + 10) : 0.1;
  const wastePenalty = record.false_done_count * 0.2 + record.blockers * 0.1 + record.workspace_sync_failures * 0.2;
  return premiumScore + timeScore - wastePenalty;
}

function confidenceFor(records: BenchmarkRecord[], best: BenchmarkRecord | undefined) {
  if (!best || records.length < 2) {
    return "low";
  }
  if (records.some((record) => record.total_tokens === 0 || record.outcome === "partial")) {
    return "low";
  }
  if (records.length >= 3 && best.outcome === "pass" && best.false_done_count === 0) {
    return "high";
  }
  return "medium";
}

export function compareBenchmarkSuite(suite: BenchmarkSuite): BenchmarkSuiteComparison {
  const records = [...suite.records];
  const best = records
    .map((record) => ({
      record,
      score: scoreRecord(record)
    }))
    .sort((left, right) => right.score - left.score)
    .at(0);
  const confidence = confidenceFor(records, best?.record);

  if (!best || !Number.isFinite(best.score) || confidence === "low") {
    return {
      confidence,
      modesCompared: records.map((record) => record.mode),
      reason: "insufficient trustworthy benchmark data",
      recommendedMode: "inconclusive"
    };
  }

  return {
    confidence,
    modesCompared: records.map((record) => record.mode),
    reason: "selected mode has lower premium token ratio, acceptable wall clock, and first-pass acceptance",
    recommendedMode: best.record.mode
  };
}
