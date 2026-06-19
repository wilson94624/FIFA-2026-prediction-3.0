import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ModelPerformance from './ModelPerformance';

describe('ModelPerformance', () => {
  it('explains model performance in Traditional Chinese', () => {
    render(<ModelPerformance
      backtest={{
        sample_size: 20,
        accuracy_1x2: 55,
        log_loss: 0.88,
        brier_score: 0.19,
        correct_score_top3_hit_rate: 30,
        calibration: [{ range: '50–60%', actual_rate: 52, count: 6 }],
        development_sets: { total: 127 },
      }}
      metrics={{ cache_hit_rate: 75 }}
    />);

    expect(screen.getByText('📈 Predictor 4.0 模型表現報告')).toBeInTheDocument();
    expect(screen.getByText('勝平負命中率')).toBeInTheDocument();
    expect(screen.getByText('預測誤差（越低越好）')).toBeInTheDocument();
    expect(screen.getByText('機率校準分數（越低越好）')).toBeInTheDocument();
    expect(screen.getByText('快取命中率')).toBeInTheDocument();
    expect(screen.queryByText('Log Loss')).not.toBeInTheDocument();
    expect(screen.queryByText('Brier Score')).not.toBeInTheDocument();
  });
});
