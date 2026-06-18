import { buildCapabilityMatrix, type CapabilityMatrix } from "./capabilityMatrix.ts";
import type { DemoEvent } from "./types.ts";

export interface LearnedCapability {
  confidence: number;
  entityId: string;
  recommendation: "avoid" | "prefer" | "probe_more";
  signal: string;
  successRate: number;
  totalAttempts: number;
}

export interface TraceLearningReport {
  generatedAt: string;
  learned: LearnedCapability[];
  matrix: CapabilityMatrix;
  minimumAttempts: number;
}

function recommendation(successRate: number, attempts: number): LearnedCapability["recommendation"] {
  if (attempts < 2) {
    return "probe_more";
  }
  if (successRate >= 0.75) {
    return "prefer";
  }
  if (successRate <= 0.4) {
    return "avoid";
  }
  return "probe_more";
}

export function learnCapabilitiesFromTrace(input: {
  events: DemoEvent[];
  generatedAt?: string;
  minimumAttempts?: number;
}): TraceLearningReport {
  const matrix = buildCapabilityMatrix(input.events);
  const minimumAttempts = input.minimumAttempts ?? 2;
  const learned: LearnedCapability[] = [];

  for (const [entityId, profile] of Object.entries(matrix.models)) {
    if (profile.attempts >= minimumAttempts) {
      learned.push({
        confidence: Math.min(1, profile.attempts / 10),
        entityId,
        recommendation: recommendation(profile.successRate, profile.attempts),
        signal: `model:${profile.capabilities.join(",") || "unknown"}`,
        successRate: profile.successRate,
        totalAttempts: profile.attempts
      });
    }
  }

  for (const [entityId, profile] of Object.entries(matrix.agents)) {
    if (profile.attempts >= minimumAttempts) {
      learned.push({
        confidence: Math.min(1, profile.attempts / 10),
        entityId,
        recommendation: recommendation(profile.successRate, profile.attempts),
        signal: `agent:${[...profile.strengths, ...profile.weaknesses].join(",") || "unknown"}`,
        successRate: profile.successRate,
        totalAttempts: profile.attempts
      });
    }
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    learned: learned.sort((left, right) => right.confidence - left.confidence || right.successRate - left.successRate),
    matrix,
    minimumAttempts
  };
}
