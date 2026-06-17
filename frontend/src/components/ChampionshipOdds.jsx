import React, { useState, useEffect } from 'react';
import probData from '../simulation_probabilities.json';

// 國家中文翻譯與國旗
import { TEAM_TRANSLATIONS } from '../utils/constants'; 

const t = (name) => {
  const item = TEAM_TRANSLATIONS?.[name] || { cn: name, flag: '🏳️' };
  return `${item.flag} ${item.cn}`;
};

export default function ChampionshipOdds({ teams }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [odds, setOdds] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    if (probData && probData.probabilities) {
      setOdds(probData.probabilities);
      setLastUpdated(probData.last_updated);
    }
  }, []);

  const filteredOdds = odds.filter(item => {
    const cnName = TEAM_TRANSLATIONS?.[item.team_name]?.cn || '';
    return item.team_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           cnName.includes(searchTerm);
  });

  return (
    <div className="glass-card animate-fade-in" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800 }} className="text-gradient">🏆 實時滾動奪冠機率排行榜</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>基於已結束真實賽果與 10,000 次蒙地卡羅預測運算</p>
        </div>
        {lastUpdated && (
          <span style={{ fontSize: '12px', color: 'var(--accent-blue)', background: 'rgba(56, 189, 248, 0.1)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
            最後更新：{lastUpdated}
          </span>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <input 
          type="text" 
          placeholder="🔍 搜尋國家隊奪冠與晉級概率..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '14px', outline: 'none' }}
        />
      </div>

      {/* Top 15 Visual Rankings */}
      {searchTerm === '' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)' }}>🔥 奪冠大熱門 Top 15</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {odds.slice(0, 15).map((item, idx) => (
              <div key={item.team_name} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ width: '28px', fontSize: '14px', fontWeight: 800, color: idx < 3 ? 'var(--accent-pink)' : 'var(--text-secondary)', textAlign: 'center' }}>
                  #{idx + 1}
                </span>
                <span style={{ width: '120px', fontSize: '14px', fontWeight: 600 }}>{t(item.team_name)}</span>
                <div style={{ flex: 1, height: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '5px', overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${item.Winner_pct}%`, 
                    height: '100%', 
                    background: 'linear-gradient(90deg, var(--accent-blue) 0%, var(--accent-purple) 100%)',
                    borderRadius: '5px' 
                  }}></div>
                </div>
                <span style={{ width: '60px', text: 'right', fontSize: '14px', fontWeight: 800, color: 'var(--accent-blue)' }}>
                  {item.Winner_pct.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid of Results / Search results */}
      <div style={{ marginTop: '10px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px' }}>
          {searchTerm !== '' ? '🔍 搜尋結果' : '🛡️ 所有參賽隊伍晉級概率表'}
        </h3>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={{ padding: '10px 0' }}>國家隊</th>
                <th>晉級 32 強</th>
                <th>晉級 16 強</th>
                <th>晉級 8 強</th>
                <th>晉級 4 強</th>
                <th>晉級 決賽</th>
                <th style={{ textAlign: 'right' }}>奪冠機率</th>
              </tr>
            </thead>
            <tbody>
              {filteredOdds.map((item, idx) => (
                <tr key={item.team_name} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }} className="team-item-hover">
                  <td style={{ padding: '12px 0', fontWeight: 600 }}>{t(item.team_name)}</td>
                  <td>{item.R32_pct.toFixed(1)}%</td>
                  <td>{item.R16_pct.toFixed(1)}%</td>
                  <td>{item.QF_pct.toFixed(1)}%</td>
                  <td>{item.SF_pct.toFixed(1)}%</td>
                  <td>{item.Final_pct.toFixed(1)}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-blue)' }}>{item.Winner_pct.toFixed(2)}%</td>
                </tr>
              ))}
              {filteredOdds.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                    無匹配的球隊
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
