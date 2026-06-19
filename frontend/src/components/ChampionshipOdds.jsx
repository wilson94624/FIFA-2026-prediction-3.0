import { useState } from 'react';
import { formatTaiwanTime, TEAM_TRANSLATIONS } from '../utils/constants';

const label = (name) => {
  const team = TEAM_TRANSLATIONS[name] || { flag: '🏳️', cn: name };
  return `${team.flag} ${team.cn}`;
};

export default function ChampionshipOdds({ data }) {
  const [query, setQuery] = useState('');
  const probabilities = data?.probabilities || [];
  const filtered = probabilities.filter((item) => {
    const translated = TEAM_TRANSLATIONS[item.team_name]?.cn || '';
    return `${item.team_name} ${translated}`.toLowerCase().includes(query.toLowerCase());
  });

  return (
    <section className="glass-card championship-card">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">10,000 MONTE CARLO RUNS</p>
          <h3>🏆 最新奪冠機率</h3>
        </div>
        {data?.last_updated && <span className="freshness">更新 {formatTaiwanTime(data.last_updated)}</span>}
      </div>
      <input
        className="search-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜尋國家隊晉級與奪冠機率"
      />
      {!query && (
        <div className="championship-top-list">
          {probabilities.slice(0, 15).map((item, index) => (
            <div key={item.team_name}>
              <span>#{index + 1}</span>
              <strong>{label(item.team_name)}</strong>
              <div><i style={{ width: `${Math.min(100, item.Winner_pct * 4)}%` }} /></div>
              <b>{item.Winner_pct.toFixed(1)}%</b>
            </div>
          ))}
        </div>
      )}
      {query && (
        <div className="odds-table-wrap">
          <table>
            <thead><tr><th>國家隊</th><th>32強</th><th>16強</th><th>8強</th><th>4強</th><th>決賽</th><th>冠軍</th></tr></thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.team_name}>
                  <td>{label(item.team_name)}</td>
                  <td>{item.R32_pct.toFixed(1)}%</td><td>{item.R16_pct.toFixed(1)}%</td>
                  <td>{item.QF_pct.toFixed(1)}%</td><td>{item.SF_pct.toFixed(1)}%</td>
                  <td>{item.Final_pct.toFixed(1)}%</td><td>{item.Winner_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
