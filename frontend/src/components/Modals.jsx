import { TEAM_TRANSLATIONS } from '../utils/constants';

const label = (name) => {
  const team = TEAM_TRANSLATIONS[name] || { flag: '🏳️', cn: name };
  return `${team.flag} ${team.cn}`;
};

function ModalShell({ children, onClose, title }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel glass-card" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" aria-label="關閉" onClick={onClose}>×</button>
        {children}
      </section>
    </div>
  );
}

export function ScoreMatrixModal({ prediction, open, onClose }) {
  if (!open || !prediction) return null;
  const model = prediction.model;
  return (
    <ModalShell onClose={onClose} title="完整比分機率矩陣">
      <p className="eyebrow">DIXON-COLES · BIVARIATE POISSON</p>
      <h2>📊 0–5 完整比分機率矩陣</h2>
      <p>{label(prediction.home)} vs {label(prediction.away)} · 合計 100%</p>
      <div className="matrix-table-wrap">
        <table className="matrix-table">
          <thead><tr><th>主\客</th>{[0, 1, 2, 3, 4, 5].map((goal) => <th key={goal}>{goal}</th>)}</tr></thead>
          <tbody>
            {[0, 1, 2, 3, 4, 5].map((homeGoal) => (
              <tr key={homeGoal}>
                <th>{homeGoal}</th>
                {[0, 1, 2, 3, 4, 5].map((awayGoal) => {
                  const score = model.score_matrix.find((item) => item.home === homeGoal && item.away === awayGoal);
                  const outcome = homeGoal > awayGoal ? 'home' : homeGoal < awayGoal ? 'away' : 'draw';
                  return <td className={outcome} key={awayGoal}>{score?.probability.toFixed(1)}%</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn-primary modal-action" onClick={onClose}>關閉視窗</button>
    </ModalShell>
  );
}

export function MatchDetailModal({ selectedMatch, prediction, review, loading, onClose }) {
  if (!selectedMatch) return null;
  const finished = selectedMatch.finished === 'TRUE' || selectedMatch.finished === true;
  const stats = selectedMatch.stats || {};
  return (
    <ModalShell onClose={onClose} title="比賽詳情">
      <p className="eyebrow">MATCH #{selectedMatch.id}</p>
      <h2>{label(selectedMatch.home_team_name_en)} vs {label(selectedMatch.away_team_name_en)}</h2>
      <div className="actual-score">
        <strong>{finished ? selectedMatch.home_score : '—'}</strong><span>{finished ? '完賽' : '尚未開賽'}</span><strong>{finished ? selectedMatch.away_score : '—'}</strong>
      </div>
      {loading && <div className="detail-loading">正在載入賽前預測與賽後檢討…</div>}
      {prediction && (
        <div className="modal-prediction-summary">
          <span>主勝 {prediction.model.probabilities.home.toFixed(1)}%</span>
          <span>和局 {prediction.model.probabilities.draw.toFixed(1)}%</span>
          <span>客勝 {prediction.model.probabilities.away.toFixed(1)}%</span>
          <b>預測比分 {prediction.model.predicted_score.home}:{prediction.model.predicted_score.away}</b>
        </div>
      )}
      {finished && (
        <div className="stats-grid">
          <div><span>控球</span><strong>{stats.possessionA ?? '—'}% : {stats.possessionB ?? '—'}%</strong></div>
          <div><span>射門</span><strong>{stats.shotsA ?? '—'} : {stats.shotsB ?? '—'}</strong></div>
          <div><span>預期進球 xG</span><strong>{stats.xgA ?? '—'} : {stats.xgB ?? '—'}</strong></div>
          <div><span>黃紅牌</span><strong>{stats.cardsA ?? '—'} : {stats.cardsB ?? '—'}</strong></div>
        </div>
      )}
      {finished && (
        <div className="stats-notes">
          <small>xG：根據射門品質估算的預期進球數</small>
          <small>黃紅牌：本場收到的黃牌與紅牌數</small>
        </div>
      )}
      {finished && (
        <section className="review-summary">
          <p className="eyebrow">賽後模型檢討</p>
          <h3>{review?.failure_type ? `失準分類：${review.failure_type}` : '賽後檢討'}</h3>
          <p>{review?.review || review?.summary || '尚無完整賽後檢討；目前先保留真實比分、基礎統計與賽前預測供比較。'}</p>
        </section>
      )}
      <button className="btn-primary modal-action" onClick={onClose}>關閉視窗</button>
    </ModalShell>
  );
}

export function TeamRosterModal({ selectedTeam, onClose }) {
  if (!selectedTeam) return null;
  const players = [...(selectedTeam.players || [])].sort((a, b) => b.overall - a.overall);
  return (
    <ModalShell onClose={onClose} title="國家隊名單">
      <p className="eyebrow">FC26 PLAYER DATABASE</p>
      <h2>{label(selectedTeam.team_name)} 國家隊名單</h2>
      <p>先發 PQS {selectedTeam.starting_pqs?.toFixed(2)} · 替補 PQS {selectedTeam.bench_pqs?.toFixed(2)} · 身價 €{selectedTeam.market_value_million_eur?.toFixed(1)}M</p>
      <div className="roster-list">
        {players.map((player) => (
          <div key={`${player.name}-${player.position}`}>
            <span>{player.position}</span><strong>{player.name}</strong><b>{player.overall}</b>
          </div>
        ))}
      </div>
      <button className="btn-primary modal-action" onClick={onClose}>關閉視窗</button>
    </ModalShell>
  );
}
