import React, { useState } from 'react';
import { TEAM_TRANSLATIONS } from '../utils/constants';
import { calculateMatchProbabilities } from '../utils/poissonMath';
import matchAnalyses from '../match_analyses.json';

const t = (name) => {
  const item = TEAM_TRANSLATIONS?.[name] || { cn: name, flag: '🏳️' };
  return `${item.flag} ${item.cn}`;
};

export function MatchDetailModal({ selectedMatch, onClose, teams, realGames }) {
  if (!selectedMatch) return null;
  const [showDetails, setShowDetails] = useState(false);

  // 計算特定隊伍在某一場比賽開踢前的累計疲勞度
  const getTeamFatigueBeforeMatch = (teamName, matchId, gamesList, teamsList) => {
    if (!gamesList || !teamsList || !teamsList[teamName]) return 0.0;
    const currentMatch = gamesList.find(g => g.id === matchId);
    if (!currentMatch) return 0.0;
    
    const parseDate = (dStr) => {
      if (!dStr) return 0;
      const [d, t] = dStr.split(' ');
      const [m, day, y] = d.split('/').map(Number);
      const [h, min] = t.split(':').map(Number);
      return new Date(y, m - 1, day, h, min).getTime();
    };
    const currentMatchTime = parseDate(currentMatch.local_date);
    
    let accumulatedFatigue = 0.0;
    gamesList.forEach(g => {
      if (g.finished === "TRUE" && parseDate(g.local_date) < currentMatchTime) {
        if (g.home_team_name_en === teamName || g.away_team_name_en === teamName) {
          const bench = teamsList[teamName].has_data ? teamsList[teamName].bench_pqs : 0.2;
          accumulatedFatigue += 0.04 * (1.0 - bench);
        }
      }
    });
    return accumulatedFatigue;
  };

  // 嘗試計算歷史預測機率
  let prediction = null;
  const teamA = selectedMatch.teamA;
  const teamB = selectedMatch.teamB;
  const tA = teams?.[teamA];
  const tB = teams?.[teamB];

  if (tA && tB && realGames) {
    const fA = getTeamFatigueBeforeMatch(teamA, selectedMatch.id, realGames, teams);
    const fB = getTeamFatigueBeforeMatch(teamB, selectedMatch.id, realGames, teams);

    const eloA = tA.fifa_points * (1.0 - fA * 0.05);
    const eloB = tB.fifa_points * (1.0 - fB * 0.05);
    
    // 拆分攻防 PQS
    let att_pqsA = (tA.att_pqs || tA.starting_pqs) * (1.0 - fA);
    let def_pqsA = (tA.def_pqs || tA.starting_pqs) * (1.0 - fA);
    let att_pqsB = (tB.att_pqs || tB.starting_pqs) * (1.0 - fB);
    let def_pqsB = (tB.def_pqs || tB.starting_pqs) * (1.0 - fB);


    const hostHosts = new Set(["USA", "Mexico", "Canada"]);
    const isHomeHost = hostHosts.has(teamA);
    const isAwayHost = hostHosts.has(teamB);

    let baseA = 1.2;
    let baseB = 1.2;

    if (isHomeHost && !isAwayHost) {
      baseA = 1.3;
      baseB = 1.1;
    } else if (!isHomeHost && isAwayHost) {
      baseA = 1.1;
      baseB = 1.3;
    }

    const c1 = 0.75;
    const c2 = 0.20;
    let lambda = Math.max(0.2, baseA + c1 * (eloA - eloB) / 450 + c2 * (att_pqsA - def_pqsB) / 0.3);
    let mu = Math.max(0.2, baseB - c1 * (eloA - eloB) / 450 + c2 * (att_pqsB - def_pqsA) / 0.3);

    // 🌟 非線性強弱懸殊 (Domination) 壓制因子
    const eloDiff = eloA - eloB;
    if (eloDiff > 250) {
      lambda += (eloDiff - 250) * 0.0018;
      mu = Math.max(0.15, mu - (eloDiff - 250) * 0.0005);
    } else if (eloDiff < -250) {
      mu += (-eloDiff - 250) * 0.0018;
      lambda = Math.max(0.15, lambda - (-eloDiff - 250) * 0.0005);
    }

    prediction = calculateMatchProbabilities(lambda, mu);
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: '16px' }} onClick={onClose}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '24px', background: '#0f172a', border: '1px solid var(--glass-border)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800 }}>比賽詳情與統計數據</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '24px', cursor: 'pointer', outline: 'none' }}>×</button>
        </div>
        
        {/* 比分板 */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <h4 style={{ fontSize: '18px', fontWeight: 800 }}>{t(selectedMatch.teamA)}</h4>
          </div>
          <div style={{ textAlign: 'center', width: '20%' }}>
            <span style={{ fontSize: '26px', fontWeight: 800 }} className="text-gradient">
              {selectedMatch.goalsA} : {selectedMatch.goalsB}
            </span>
            {selectedMatch.extraTime && <div style={{ fontSize: '10px', color: 'var(--accent-purple)', marginTop: '4px', fontWeight: 800 }}>AET</div>}
            {selectedMatch.penScore && <div style={{ fontSize: '10px', color: 'var(--accent-pink)', fontWeight: 800 }}>PK ({selectedMatch.penScore.a}:{selectedMatch.penScore.b})</div>}
          </div>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <h4 style={{ fontSize: '18px', fontWeight: 800 }}>{t(selectedMatch.teamB)}</h4>
          </div>
        </div>

        {/* 進球人名單 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.05)', minHeight: '60px' }}>
          <div style={{ width: '45%' }}>
            {selectedMatch.scorersA?.map((s, idx) => (
              <p key={idx} style={{ margin: '4px 0' }}>⚽ {s.name} ({s.min}')</p>
            ))}
          </div>
          <div style={{ width: '10%' }}></div>
          <div style={{ width: '45%', textAlign: 'right' }}>
            {selectedMatch.scorersB?.map((s, idx) => (
              <p key={idx} style={{ margin: '4px 0' }}>⚽ {s.name} ({s.min}')</p>
            ))}
          </div>
        </div>

        {/* 模擬技術數據 */}
        {selectedMatch.stats && (
          <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                <span>{selectedMatch.stats.possessionA}%</span>
                <span>控球率 (Possession)</span>
                <span>{selectedMatch.stats.possessionB}%</span>
              </div>
              <div style={{ display: 'flex', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${selectedMatch.stats.possessionA}%`, background: 'var(--accent-blue)' }}></div>
                <div style={{ width: `${selectedMatch.stats.possessionB}%`, background: 'var(--accent-purple)' }}></div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ fontWeight: 600 }}>{selectedMatch.stats.shotsA}</span>
              <span style={{ color: 'var(--text-secondary)' }}>射門次數 (Shots)</span>
              <span style={{ fontWeight: 600 }}>{selectedMatch.stats.shotsB}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ fontWeight: 600 }}>{selectedMatch.stats.foulsA}</span>
              <span style={{ color: 'var(--text-secondary)' }}>犯規次數 (Fouls)</span>
              <span style={{ fontWeight: 600 }}>{selectedMatch.stats.foulsB}</span>
            </div>
          </div>
        )}

        {/* 🔮 模型歷史預測比對 */}
        {prediction && (
          <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>🔮</span> 模型歷史預測比對
              </h4>
              <button 
                onClick={() => setShowDetails(true)} 
                style={{ 
                  background: 'rgba(56, 189, 248, 0.1)', 
                  border: '1px solid rgba(56, 189, 248, 0.2)', 
                  color: 'var(--accent-blue)', 
                  padding: '4px 10px', 
                  borderRadius: '12px', 
                  fontSize: '11px', 
                  fontWeight: 600, 
                  cursor: 'pointer' 
                }}
              >
                詳細機率
              </button>
            </div>
            
            {/* 勝率條 */}
            <div>
              <div style={{ display: 'flex', height: '18px', borderRadius: '9px', overflow: 'hidden', fontSize: '10px', fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: '18px' }}>
                <div style={{ width: `${prediction.winA}%`, background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {prediction.winA > 15 && `${prediction.winA.toFixed(0)}%`}
                </div>
                <div style={{ width: `${prediction.draw}%`, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  {prediction.draw > 15 && `平 ${prediction.draw.toFixed(0)}%`}
                </div>
                <div style={{ width: `${prediction.winB}%`, background: 'var(--accent-pink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {prediction.winB > 15 && `${prediction.winB.toFixed(0)}%`}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '4px', color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{TEAM_TRANSLATIONS?.[teamA]?.cn} 勝</span>
                <span style={{ color: 'var(--accent-pink)', fontWeight: 600 }}>{TEAM_TRANSLATIONS?.[teamB]?.cn} 勝</span>
              </div>
            </div>

            {/* 最可能比分 Top 2 */}
            <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '8px', gap: '10px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ display: 'block', color: 'var(--accent-blue)', fontWeight: 800, marginBottom: '4px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{TEAM_TRANSLATIONS?.[teamA]?.cn} 最可能比分</span>
                {prediction.topScoresA.slice(0, 2).map((item, idx) => (
                  <span key={idx} style={{ display: 'block', margin: '2px 0' }}>{item.home}:{item.away} ({(item.prob * 100).toFixed(1)}%)</span>
                ))}
              </div>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }}></div>
              <div style={{ flex: 1 }}>
                <span style={{ display: 'block', color: 'var(--text-secondary)', fontWeight: 800, marginBottom: '4px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>平局最可能比分</span>
                {prediction.topScoresDraw?.slice(0, 2).map((item, idx) => (
                  <span key={idx} style={{ display: 'block', margin: '2px 0' }}>{item.home}:{item.away} ({(item.prob * 100).toFixed(1)}%)</span>
                ))}
              </div>
              <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }}></div>
              <div style={{ flex: 1 }}>
                <span style={{ display: 'block', color: 'var(--accent-pink)', fontWeight: 800, marginBottom: '4px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{TEAM_TRANSLATIONS?.[teamB]?.cn} 最可能比分</span>
                {prediction.topScoresB.slice(0, 2).map((item, idx) => (
                  <span key={idx} style={{ display: 'block', margin: '2px 0' }}>{item.home}:{item.away} ({(item.prob * 100).toFixed(1)}%)</span>
                ))}
              </div>
            </div>
          </div>
        )}

        <button onClick={onClose} className="btn-secondary" style={{ width: '100%', marginTop: '24px', padding: '10px', fontWeight: 600 }}>
          關閉詳情
        </button>
      </div>

      {showDetails && (
        <MatchScoreDetailsModal 
          teamA={teamA}
          teamB={teamB}
          prediction={prediction}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}

export function MatchScoreDetailsModal({ teamA, teamB, prediction, onClose }) {
  const tA = TEAM_TRANSLATIONS?.[teamA] || { cn: teamA, flag: '🏳️' };
  const tB = TEAM_TRANSLATIONS?.[teamB] || { cn: teamB, flag: '🏳️' };

  // 定義常見比分列表 (對齊台灣運彩常見清單)
  const homeWinScores = ['1:0', '2:0', '2:1', '3:0', '3:1', '3:2', '4:0', '4:1', '4:2', '5:0', '5:1', '5:2'];
  const drawScores = ['0:0', '1:1', '2:2', '3:3', '4:4', '5:5'];
  const awayWinScores = ['0:1', '0:2', '1:2', '0:3', '1:3', '2:3', '0:4', '1:4', '2:4', '0:5', '1:5', '2:5'];

  const scoresMap = {};
  if (prediction.scoreList) {
    prediction.scoreList.forEach(s => {
      scoresMap[`${s.home}:${s.away}`] = s.prob * 100;
    });
  }

  // 主勝
  let listedHomeProbSum = 0;
  const homeList = homeWinScores.map(score => {
    const p = scoresMap[score] || 0;
    listedHomeProbSum += p;
    return { score, prob: p };
  });
  const otherHomeProb = Math.max(0, prediction.winA - listedHomeProbSum);

  // 客勝
  let listedAwayProbSum = 0;
  const awayList = awayWinScores.map(score => {
    const p = scoresMap[score] || 0;
    listedAwayProbSum += p;
    return { score, prob: p };
  });
  const otherAwayProb = Math.max(0, prediction.winB - listedAwayProbSum);

  // 平局
  let listedDrawProbSum = 0;
  const drawList = drawScores.map(score => {
    const p = scoresMap[score] || 0;
    listedDrawProbSum += p;
    return { score, prob: p };
  });
  const otherDrawProb = Math.max(0, prediction.draw - listedDrawProbSum);

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(2, 6, 23, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        padding: '16px'
      }} 
      onClick={onClose}
    >
      <div 
        className="glass-card animate-fade-in" 
        style={{
          width: '100%',
          maxWidth: '800px',
          padding: '24px',
          background: '#0f172a',
          border: '1px solid var(--glass-border)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 900 }} className="text-gradient">
              🔮 兩隊比數預測機率詳情
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {tA.flag} {tA.cn} vs {tB.flag} {tB.cn} — 基於 Dixon-Coles 雙卜瓦松與動態 ELO 統計模型
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '28px', cursor: 'pointer', outline: 'none' }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '20px' }}>
          
          {/* 左欄：主隊獲勝 */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', padding: '16px' }}>
            <div style={{ borderBottom: '2px solid var(--accent-blue)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#fff', fontSize: '13.5px' }}>{tA.cn} 獲勝</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-blue)' }}>{prediction.winA.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {homeList.map(item => (
                <div key={item.score} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12.5px', transition: 'all 0.15s ease', cursor: 'default' }} className="team-item-hover home-hover">
                  <span style={{ fontWeight: 800 }}>{item.score}</span>
                  <span style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{item.prob.toFixed(1)}%</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '6px', fontSize: '12.5px', border: '1px dashed rgba(59, 130, 246, 0.2)' }} className="team-item-hover home-hover">
                <span style={{ fontWeight: 800, color: 'var(--accent-blue)' }}>其他比分</span>
                <span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>{otherHomeProb.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* 中欄：和局 */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', padding: '16px' }}>
            <div style={{ borderBottom: '2px solid rgba(255,255,255,0.2)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#fff', fontSize: '13.5px' }}>和局 (打平)</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)' }}>{prediction.draw.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {drawList.map(item => (
                <div key={item.score} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12.5px', transition: 'all 0.15s ease', cursor: 'default' }} className="team-item-hover draw-hover">
                  <span style={{ fontWeight: 800 }}>{item.score}</span>
                  <span style={{ color: '#fff', fontWeight: 700, opacity: 0.8 }}>{item.prob.toFixed(1)}%</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12.5px', border: '1px dashed rgba(255,255,255,0.1)' }} className="team-item-hover draw-hover">
                <span style={{ fontWeight: 800, color: 'var(--text-secondary)' }}>其他比分</span>
                <span style={{ color: '#fff', fontWeight: 800, opacity: 0.8 }}>{otherDrawProb.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* 右欄：客隊獲勝 */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)', padding: '16px' }}>
            <div style={{ borderBottom: '2px solid var(--accent-pink)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, color: '#fff', fontSize: '13.5px' }}>{tB.cn} 獲勝</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-pink)' }}>{prediction.winB.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {awayList.map(item => (
                <div key={item.score} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12.5px', transition: 'all 0.15s ease', cursor: 'default' }} className="team-item-hover away-hover">
                  <span style={{ fontWeight: 800 }}>{item.score}</span>
                  <span style={{ color: 'var(--accent-pink)', fontWeight: 700 }}>{item.prob.toFixed(1)}%</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(244, 63, 94, 0.05)', borderRadius: '6px', fontSize: '12.5px', border: '1px dashed rgba(244, 63, 94, 0.2)' }} className="team-item-hover away-hover">
                <span style={{ fontWeight: 800, color: 'var(--accent-pink)' }}>其他比分</span>
                <span style={{ color: 'var(--accent-pink)', fontWeight: 800 }}>{otherAwayProb.toFixed(1)}%</span>
              </div>
            </div>
          </div>

        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
          <button 
            onClick={onClose} 
            className="btn-secondary"
            style={{ padding: '8px 24px', borderRadius: '20px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 800 }}
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamRosterModal({ selectedTeam, realGames, onClose }) {
  if (!selectedTeam) return null;

  // 1. 尋找該球隊下一場即將開踢賽事 (finished === "FALSE") 中的缺席名單
  let unavailablePlayerNames = [];
  if (realGames && selectedTeam) {
    const tName = selectedTeam.team_name;
    const upcomingForTeam = [...realGames]
      .filter(g => g.finished === "FALSE" && (g.home_team_name_en === tName || g.away_team_name_en === tName))
      .sort((a, b) => {
        const parseDate = (dStr) => {
          if (!dStr) return 0;
          const [d, t] = dStr.split(' ');
          const [m, day, y] = d.split('/').map(Number);
          const [h, min] = t.split(':').map(Number);
          return new Date(y, m - 1, day, h, min).getTime();
        };
        return parseDate(a.local_date) - parseDate(b.local_date);
      });
      
    if (upcomingForTeam.length > 0) {
      const match = upcomingForTeam[0];
      if (match.stats && match.stats.unavailable_players) {
        const un = match.stats.unavailable_players;
        const isHome = match.home_team_name_en === tName;
        const unList = isHome ? (un.home || []) : (un.away || []);
        unavailablePlayerNames = unList.map(p => p.name.toLowerCase());
      }
    }
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(2, 6, 23, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100, padding: '16px' }} onClick={onClose}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '620px', maxHeight: '85vh', overflowY: 'auto', padding: '24px', background: '#0f172a', border: '1px solid var(--glass-border)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
          <div>
            <h3 style={{ fontSize: '22px', fontWeight: 800 }} className="text-gradient">{t(selectedTeam.team_name)}</h3>
            {selectedTeam.has_data && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                先發 PQS: {selectedTeam.starting_pqs.toFixed(2)} | 替補 PQS: {selectedTeam.bench_pqs.toFixed(2)} | 身價: €{selectedTeam.market_value_million_eur.toFixed(1)}M
              </p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '24px', cursor: 'pointer', outline: 'none' }}>×</button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', marginTop: '10px' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '8px 0' }}>球員姓名</th>
              <th>位置</th>
              <th>評分 (OVR)</th>
              <th>市場身價</th>
              <th style={{ textAlign: 'right' }}>戰力期望值 (PQS)</th>
            </tr>
          </thead>
          <tbody>
            {selectedTeam.players.sort((a,b) => b.overall - a.overall).map((p, idx) => {
              const pName = p.name.toLowerCase();
              const pParts = pName.split('.').pop().trim().split(/\s+/);
              const lastName = pParts[pParts.length - 1] || pName;
              
              const isInjured = unavailablePlayerNames.some(unName => 
                unName.includes(lastName) || pName.includes(unName)
              );

              return (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', color: isInjured ? 'var(--text-secondary)' : (p.is_star ? 'var(--accent-blue)' : '#fff'), opacity: isInjured ? 0.55 : 1 }}>
                  <td style={{ padding: '10px 0', fontWeight: p.is_star && !isInjured ? 700 : 400 }}>
                    {p.name} {p.is_star && '⭐'} {isInjured && <span style={{ color: '#ef4444', fontSize: '11px', marginLeft: '6px', fontWeight: 800 }}>🤕 傷退</span>}
                  </td>
                  <td>{p.position}</td>
                  <td style={{ fontWeight: 800 }}>{p.overall}</td>
                  <td>{p.value_eur > 0 ? `€${(p.value_eur / 1000000).toFixed(1)}M` : '-'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{p.efficiency_score.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button onClick={onClose} className="btn-secondary" style={{ width: '100%', marginTop: '24px', padding: '10px', fontWeight: 600 }}>
          關閉名單
        </button>
      </div>
    </div>
  );
}
