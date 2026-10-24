export interface ConsensusResult {
  reached: boolean;
  confidence: number; // 0-1
  agreementCount: number;
  totalCount: number;
}

/**
 * 以簡單多數決判定共識。若共識度超過門檻
 * (force_counterfactual_if_consensus_gt)，則視為「偽共識」，
 * 需要強制引入質疑者。
 */
export class ConsensusEvaluator {
  constructor(private readonly threshold = 0.7) {}

  evaluate(signals: number[], forceDissenting = false): ConsensusResult {
    const totalCount = signals.length;
    if (totalCount === 0) return { reached: false, confidence: 0, agreementCount: 0, totalCount };

    const agreementCount = signals.filter((s) => s > 0.5).length;
    const confidence = agreementCount / totalCount;

    const forced = forceDissenting || confidence > this.threshold;
    return {
      reached: !forced && confidence >= this.threshold,
      confidence,
      agreementCount,
      totalCount,
    };
  }
}