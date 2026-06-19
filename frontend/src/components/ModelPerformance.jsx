function MetricCard({ label, value, suffix = '' }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value == null ? '—' : `${value}${suffix}`}</strong>
    </div>
  );
}

export default function ModelPerformance({ backtest, metrics }) {
  if (!backtest) return <main className="loading-panel">尚無回測資料。</main>;
  return (
    <main className="page-container performance-page">
      <section className="glass-card performance-hero">
        <p className="eyebrow">歷史回測結果</p>
        <h2>📈 Predictor 4.0 模型表現報告</h2>
        <p>2026 已完賽賽事依時間順序驗證；歐洲國家盃、美洲盃與非洲國家盃共 {backtest.development_sets?.total || 127} 場僅用於模型開發，不列入正式驗證成績。</p>
        <div className="metric-grid">
          <MetricCard label="已驗證場次" value={backtest.sample_size} />
          <MetricCard label="勝平負命中率" value={backtest.accuracy_1x2} suffix="%" />
          <MetricCard label="預測誤差（越低越好）" value={backtest.log_loss} />
          <MetricCard label="機率校準分數（越低越好）" value={backtest.brier_score} />
          <MetricCard label="正確比分前三名命中率" value={backtest.correct_score_top3_hit_rate} suffix="%" />
        </div>
      </section>

      <section className="glass-card calibration-card">
        <div className="section-heading-row">
          <div><p className="eyebrow">預測校準度</p><h3>模型給出的信心是否可靠</h3></div>
          <span className="freshness">{backtest.sample_size ? '持續驗證中' : '等待完賽資料'}</span>
        </div>
        <div className="calibration-chart">
          {backtest.calibration.map((bucket) => (
            <div key={bucket.range}>
              <span>{bucket.range}</span>
              <div><i style={{ height: `${bucket.actual_rate || 0}%` }} /></div>
              <strong>{bucket.actual_rate == null ? '—' : `${bucket.actual_rate}%`}</strong>
              <small>{bucket.count} 場</small>
            </div>
          ))}
        </div>
        <p className="disclaimer">每格比較該信心區間的實際命中率；樣本不足時不做過度解讀。</p>
      </section>

      <section className="glass-card monitoring-card">
        <p className="eyebrow">系統狀態</p>
        <h3>⚙️ 資料更新與運算效能</h3>
        <div className="metric-grid">
          <MetricCard label="賽事資料更新耗時" value={metrics?.worldcup_api_time?.latest_seconds} suffix=" 秒" />
          <MetricCard label="FotMob 資料更新耗時" value={metrics?.fotmob_time?.latest_seconds} suffix=" 秒" />
          <MetricCard label="賽事模擬耗時" value={metrics?.simulation_time?.latest_seconds} suffix=" 秒" />
          <MetricCard label="快取命中率" value={metrics?.cache_hit_rate} suffix="%" />
        </div>
      </section>
    </main>
  );
}
