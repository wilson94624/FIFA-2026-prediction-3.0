import React, { useState, useEffect } from 'react';
import teamsDb from './teams_db.json';
import realGamesResults from './real_games_results.json';
import { TEAM_TRANSLATIONS, toTaiwanTime } from './utils/constants';

// 模組化拆分後導入的組件
import NextMatchPredictor from './components/NextMatchPredictor';
import TournamentBracket from './components/TournamentBracket';
import { MatchDetailModal, TeamRosterModal } from './components/Modals';

// 模組化拆分後導入的邏輯與模擬引擎
import { playMatch, applyRealPerformanceBoost } from './utils/simulator';


export default function App() {
  const [activeTab, setActiveTab] = useState('next-match'); // next-match | championship | simulate
  const [teams, setTeams] = useState({});
  const [realGames, setRealGames] = useState([]);
  const [fatigue, setFatigue] = useState({});
  const [currentStage, setCurrentStage] = useState('init');
  
  // 模擬賽程狀態
  const [groupResults, setGroupResults] = useState(null);
  const [r32Matches, setR32Matches] = useState([]);
  const [r16Matches, setR16Matches] = useState([]);
  const [qfMatches, setQfMatches] = useState([]);
  const [sfMatches, setSfMatches] = useState([]);
  const [finalMatch, setFinalMatch] = useState(null);
  const [champion, setChampion] = useState(null);
  
  // Modals 控制
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingLLM, setIsSyncingLLM] = useState(false);

  const handleSyncData = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      if (data.success) {
        if (import.meta.env.PROD) {
          window.location.reload();
        } else {
          alert('真實比分同步成功！');
        }
      } else {
        alert('比分同步失敗：' + (data.error || '未知錯誤'));
      }
    } catch (err) {
      alert('同步出錯：' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncLLM = async () => {
    setIsSyncingLLM(true);
    try {
      const res = await fetch('/api/sync-llm');
      const data = await res.json();
      if (data.success) {
        if (import.meta.env.PROD) {
          window.location.reload();
        } else {
          alert('AI 專家解析與 10,000 次戰力模擬已成功更新！');
        }
      } else {
        alert('AI 解析更新失敗：' + (data.error || '未知錯誤'));
      }
    } catch (err) {
      alert('同步出錯：' + err.message);
    } finally {
      setIsSyncingLLM(false);
    }
  };

  useEffect(() => {
    // 載入初始 teams
    const initialTeams = JSON.parse(JSON.stringify(teamsDb));
    Object.keys(initialTeams).forEach(name => {
      const t = initialTeams[name];
      if (t.has_data) {
        const sorted = [...t.players].sort((a, b) => b.efficiency_score - a.efficiency_score);
        const starters = sorted.slice(0, 11);
        const fw_mf = starters.filter(p => p.position === 'FW' || p.position === 'MF');
        const df_gk = starters.filter(p => p.position === 'DF' || p.position === 'GK');
        t.att_pqs = fw_mf.length > 0 ? fw_mf.reduce((sum, p) => sum + p.efficiency_score, 0) / fw_mf.length : t.starting_pqs;
        t.def_pqs = df_gk.length > 0 ? df_gk.reduce((sum, p) => sum + p.efficiency_score, 0) / df_gk.length : t.starting_pqs;
      } else {
        t.att_pqs = t.starting_pqs;
        t.def_pqs = t.starting_pqs;
      }
    });
    setTeams(initialTeams);
    // 載入本地 API 同步賽果
    setRealGames(realGamesResults);
  }, []);

  // 1. 模擬小組賽
  const simulateGroupStage = () => {
    // 優先套用真實世界表現累加戰力加成
    const boostedTeams = applyRealPerformanceBoost(JSON.parse(JSON.stringify(teamsDb)), realGames);
    setTeams(boostedTeams);

    let currentFatigue = {};
    const standings = {};
    Object.keys(boostedTeams).forEach(team => {
      standings[team] = { team, points: 0, gd: 0, gs: 0, wins: 0, draw: 0, loss: 0 };
    });
    
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const matchesPlayed = [];
    
    groups.forEach(grp => {
      const grpTeams = Object.keys(boostedTeams).filter(t => boostedTeams[t].group === grp);
      for (let i = 0; i < grpTeams.length; i++) {
        for (let j = i + 1; j < grpTeams.length; j++) {
          const res = playMatch(grpTeams[i], grpTeams[j], boostedTeams, currentFatigue, realGames, 'group');
          currentFatigue = { ...currentFatigue, ...res.updatedFatigue };
          matchesPlayed.push(res);
          
          const tA = res.teamA;
          const tB = res.teamB;
          
          standings[tA].gs += res.goalsA;
          standings[tA].gd += (res.goalsA - res.goalsB);
          standings[tB].gs += res.goalsB;
          standings[tB].gd += (res.goalsB - res.goalsA);
          
          if (res.winner === tA) {
            standings[tA].points += 3;
            standings[tA].wins += 1;
            standings[tB].loss += 1;
          } else if (res.winner === tB) {
            standings[tB].points += 3;
            standings[tB].wins += 1;
            standings[tA].loss += 1;
          } else {
            standings[tA].points += 1;
            standings[tB].points += 1;
            standings[tA].draw += 1;
            standings[tB].draw += 1;
          }
        }
      }
    });
    
    setFatigue(currentFatigue);
    
    // 排序小組名次
    const groupStandings = {};
    groups.forEach(grp => {
      const grpTeams = Object.keys(boostedTeams).filter(t => boostedTeams[t].group === grp);
      const sorted = grpTeams.map(t => standings[t]).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gd !== a.gd) return b.gd - a.gd;
        if (b.gs !== a.gs) return b.gs - a.gs;
        return (boostedTeams[b.team].fifa_points - boostedTeams[a.team].fifa_points);
      });
      groupStandings[grp] = sorted;
    });
    
    // 篩選小組第一第二與最好的 8 個第三名
    const qualified1stAnd2nd = [];
    const thirdPlaces = [];
    
    groups.forEach(grp => {
      qualified1stAnd2nd.push(groupStandings[grp][0].team);
      qualified1stAnd2nd.push(groupStandings[grp][1].team);
      thirdPlaces.push(groupStandings[grp][2]);
    });
    
    const sortedThirds = thirdPlaces.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gs !== a.gs) return b.gs - a.gs;
      return (boostedTeams[b.team].fifa_points - boostedTeams[a.team].fifa_points);
    });
    
    const qualifiedThirds = sortedThirds.slice(0, 8).map(t => t.team);
    
    // 依據 2026 世界盃官方分組對位來進行 16 場 32強 配對
    const r32Pairings = [
      { teamA: groupStandings['A'][1].team, teamB: groupStandings['B'][1].team }, // A2 vs B2 (Match 73)
      { teamA: groupStandings['C'][0].team, teamB: groupStandings['F'][1].team }, // C1 vs F2 (Match 74)
      { teamA: groupStandings['E'][0].team, teamB: qualifiedThirds[0] },           // E1 vs T1 (Match 75)
      { teamA: groupStandings['F'][0].team, teamB: groupStandings['C'][1].team }, // F1 vs C2 (Match 76)
      { teamA: groupStandings['E'][1].team, teamB: groupStandings['I'][1].team }, // E2 vs I2 (Match 77)
      { teamA: groupStandings['I'][0].team, teamB: qualifiedThirds[1] },           // I1 vs T2 (Match 78)
      { teamA: groupStandings['A'][0].team, teamB: qualifiedThirds[2] },           // A1 vs T3 (Match 79)
      { teamA: groupStandings['L'][0].team, teamB: qualifiedThirds[3] },           // L1 vs T4 (Match 80)
      { teamA: groupStandings['G'][0].team, teamB: qualifiedThirds[5] },           // G1 vs T6 (Match 81)
      { teamA: groupStandings['D'][0].team, teamB: qualifiedThirds[4] },           // D1 vs T5 (Match 82)
      { teamA: groupStandings['H'][0].team, teamB: groupStandings['J'][1].team }, // H1 vs J2 (Match 83)
      { teamA: groupStandings['K'][1].team, teamB: groupStandings['L'][1].team }, // K2 vs L2 (Match 84)
      { teamA: groupStandings['B'][0].team, teamB: qualifiedThirds[6] },           // B1 vs T7 (Match 85)
      { teamA: groupStandings['D'][1].team, teamB: groupStandings['G'][1].team }, // D2 vs G2 (Match 86)
      { teamA: groupStandings['J'][0].team, teamB: groupStandings['H'][1].team }, // J1 vs H2 (Match 87)
      { teamA: groupStandings['K'][0].team, teamB: qualifiedThirds[7] }            // K1 vs T8 (Match 88)
    ];

    const nextMatches = r32Pairings.map(p => ({
      teamA: p.teamA,
      teamB: p.teamB,
      result: null
    }));

    setGroupResults({ standings: groupStandings, matches: matchesPlayed });
    setR32Matches(nextMatches);
    setCurrentStage('group');
  };

  // 2. 模擬 32 強
  const simulateR32 = () => {
    let currentFatigue = { ...fatigue };
    const updated = r32Matches.map(m => {
      const res = playMatch(m.teamA, m.teamB, teams, currentFatigue, realGames, 'r32', true);
      currentFatigue = { ...currentFatigue, ...res.updatedFatigue };
      return { ...m, result: res };
    });
    setR32Matches(updated);
    setFatigue(currentFatigue);
    
    const winners = updated.map(m => m.result.winner);
    const nextMatches = [];
    for (let i = 0; i < 8; i++) {
      nextMatches.push({ teamA: winners[i * 2], teamB: winners[i * 2 + 1], result: null });
    }
    setR16Matches(nextMatches);
    setCurrentStage('r32');
  };

  // 3. 模擬 16 強
  const simulateR16 = () => {
    let currentFatigue = { ...fatigue };
    const updated = r16Matches.map(m => {
      const res = playMatch(m.teamA, m.teamB, teams, currentFatigue, realGames, 'r16', true);
      currentFatigue = { ...currentFatigue, ...res.updatedFatigue };
      return { ...m, result: res };
    });
    setR16Matches(updated);
    setFatigue(currentFatigue);
    
    const winners = updated.map(m => m.result.winner);
    const nextMatches = [];
    for (let i = 0; i < 4; i++) {
      nextMatches.push({ teamA: winners[i * 2], teamB: winners[i * 2 + 1], result: null });
    }
    setQfMatches(nextMatches);
    setCurrentStage('r16');
  };

  // 4. 模擬 8 強
  const simulateQF = () => {
    let currentFatigue = { ...fatigue };
    const updated = qfMatches.map(m => {
      const res = playMatch(m.teamA, m.teamB, teams, currentFatigue, realGames, 'qf', true);
      currentFatigue = { ...currentFatigue, ...res.updatedFatigue };
      return { ...m, result: res };
    });
    setQfMatches(updated);
    setFatigue(currentFatigue);
    
    const winners = updated.map(m => m.result.winner);
    const nextMatches = [];
    for (let i = 0; i < 2; i++) {
      nextMatches.push({ teamA: winners[i * 2], teamB: winners[i * 2 + 1], result: null });
    }
    setSfMatches(nextMatches);
    setCurrentStage('qf');
  };

  // 5. 模擬 4 強
  const simulateSF = () => {
    let currentFatigue = { ...fatigue };
    const updated = sfMatches.map(m => {
      const res = playMatch(m.teamA, m.teamB, teams, currentFatigue, realGames, 'sf', true);
      currentFatigue = { ...currentFatigue, ...res.updatedFatigue };
      return { ...m, result: res };
    });
    setSfMatches(updated);
    setFatigue(currentFatigue);
    
    const winners = updated.map(m => m.result.winner);
    setFinalMatch({ teamA: winners[0], teamB: winners[1], result: null });
    setCurrentStage('sf');
  };

  // 6. 模擬決賽
  const simulateFinal = () => {
    let currentFatigue = { ...fatigue };
    const res = playMatch(finalMatch.teamA, finalMatch.teamB, teams, currentFatigue, realGames, 'final', true);
    currentFatigue = { ...currentFatigue, ...res.updatedFatigue };
    setFinalMatch(prev => ({ ...prev, result: res }));
    setChampion(res.winner);
    setFatigue(currentFatigue);
    setCurrentStage('champion');
  };

  // 重置模擬
  const resetSimulation = () => {
    setGroupResults(null);
    setR32Matches([]);
    setR16Matches([]);
    setQfMatches([]);
    setSfMatches([]);
    setFinalMatch(null);
    setChampion(null);
    setFatigue({});
    setTeams(JSON.parse(JSON.stringify(teamsDb)));
    setCurrentStage('init');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* 🚀 Top Premium Navigation */}
      <header className="glass-card app-header">
        <div className="header-logo">
          <span style={{ fontSize: '32px' }}>🏆</span>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, tracking: '-0.05em' }} className="text-gradient">
              FIFA 2026 PREDICTOR 3.0
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>即時賽果同步與球員表現疊加預測系統</p>
          </div>
        </div>
        
        <nav className="header-nav">
          <button 
            onClick={handleSyncData} 
            disabled={isSyncing || isSyncingLLM} 
            className="btn-secondary" 
            style={{ 
              padding: '8px 16px', 
              fontSize: '14px', 
              borderColor: 'var(--accent-blue)', 
              color: 'var(--accent-blue)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isSyncing ? '🔄 比分同步中...' : '🔄 同步最新真實賽果'}
          </button>
          
          <button 
            onClick={handleSyncLLM} 
            disabled={isSyncing || isSyncingLLM} 
            className="btn-secondary" 
            style={{ 
              padding: '8px 16px', 
              fontSize: '14px', 
              borderColor: 'var(--accent-purple)', 
              color: 'var(--accent-purple)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isSyncingLLM ? '🤖 AI 解析與模擬中...' : '🤖 運行 AI 解析與戰力模擬'}
          </button>
          <button onClick={() => setActiveTab('next-match')} className={activeTab === 'next-match' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '8px 16px', fontSize: '14px' }}>
            🔮 下一場預測
          </button>
          <button onClick={() => setActiveTab('simulate')} className={activeTab === 'simulate' ? 'btn-primary' : 'btn-secondary'} style={{ padding: '8px 16px', fontSize: '14px' }}>
            🏟️ 即時賽程與積分
          </button>
        </nav>
      </header>

      {/* 🔮 TAB 1: NEXT MATCH PREDICTOR */}
      {activeTab === 'next-match' && (
        <main style={{ flex: 1, padding: '0 16px 40px 16px', maxWidth: '1500px', margin: '0 auto', width: '100%' }}>
          <NextMatchPredictor teams={teams} realGames={realGames} />
        </main>
      )}



      {/* 🏟️ TAB 3: LIVE TOURNAMENT BRACKET & STANDINGS */}
      {activeTab === 'simulate' && (
        <main style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <TournamentBracket 
            teams={teams}
            realGames={realGames}
            onSelectMatch={setSelectedMatch}
            onSelectTeam={setSelectedTeam}
          />
        </main>
      )}

      {/* 🏆 MODALS */}
      <MatchDetailModal selectedMatch={selectedMatch} onClose={() => setSelectedMatch(null)} teams={teams} realGames={realGames} />
      <TeamRosterModal selectedTeam={selectedTeam} realGames={realGames} onClose={() => setSelectedTeam(null)} />

      {/* 🏆 Footer */}
      <footer style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '13px', borderTop: '1px solid var(--glass-border)', marginTop: 'auto' }}>
        ⚽ 2026 世界盃預測網站 3.0 — 實現高內聚低耦合模組化架構，支援真實世界賽事即時滾動預測。
      </footer>

    </div>
  );
}
