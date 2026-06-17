import React, { useState, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import { MatchScoreDetailsModal } from './Modals';
import probData from '../simulation_probabilities.json';
import { calculateMatchProbabilities } from '../utils/poissonMath';
import { TEAM_TRANSLATIONS, toTaiwanTime } from '../utils/constants';
import matchAnalyses from '../match_analyses.json';

const t = (name) => {
  const item = TEAM_TRANSLATIONS?.[name] || { cn: name, flag: '🏳️' };
  return `${item.flag} ${item.cn}`;
};

const formatMod = (val) => {
  if (val === undefined || val === null) return <span style={{ color: 'var(--text-secondary)' }}>100% (基準)</span>;
  const diff = Math.round((val - 1.0) * 100);
  if (diff > 0) return <span style={{ color: '#10b981', fontWeight: 800 }}>+{diff}% 戰力提升 📈</span>;
  if (diff < 0) return <span style={{ color: '#ef4444', fontWeight: 800 }}>{diff}% 戰力下修 📉</span>;
  return <span style={{ color: 'var(--text-secondary)' }}>100% (基準)</span>;
};

const getActivePqs = (teamData, unavailableNames = [], fatigueVal = 0.0) => {
  if (!teamData || !teamData.has_data) {
    const pqs = teamData?.starting_pqs || 0.5;
    return {
      attPqs: pqs * (1.0 - fatigueVal),
      defPqs: pqs * (1.0 - fatigueVal)
    };
  }

  const players = teamData.players || [];
  const activePlayers = [];

  players.forEach(p => {
    const pName = p.name.toLowerCase();
    let isInjured = false;
    for (let unName of unavailableNames) {
      const unNameLower = unName.toLowerCase();
      const pParts = pName.split('.').pop().trim().split(/\s+/);
      const lastName = pParts[pParts.length - 1] || pName;
      if (unNameLower.includes(lastName) || pName.includes(unNameLower)) {
        isInjured = true;
        break;
      }
    }
    if (!isInjured) {
      activePlayers.push(p);
    }
  });

  const finalActive = activePlayers.length > 0 ? activePlayers : players;

  const sortedPlayers = [...finalActive].sort((a, b) => b.efficiency_score - a.efficiency_score);
  const starters = sortedPlayers.slice(0, 11);

  const fwMf = starters.filter(p => p.position === 'FW' || p.position === 'MF');
  const dfGk = starters.filter(p => p.position === 'DF' || p.position === 'GK');

  const attPqs = fwMf.length > 0 ? fwMf.reduce((sum, p) => sum + p.efficiency_score, 0) / fwMf.length : (teamData.starting_pqs || 0.5);
  const defPqs = dfGk.length > 0 ? dfGk.reduce((sum, p) => sum + p.efficiency_score, 0) / dfGk.length : (teamData.starting_pqs || 0.5);

  return {
    attPqs: attPqs * (1.0 - fatigueVal),
    defPqs: defPqs * (1.0 - fatigueVal)
  };
};

export default function NextMatchPredictor({ teams, realGames }) {
  const [nextMatch, setNextMatch] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [teamAInfo, setTeamAInfo] = useState(null);
  const [teamBInfo, setTeamBInfo] = useState(null);
  const [fatigueA, setFatigueA] = useState(0);
  const [fatigueB, setFatigueB] = useState(0);
  const [unavailableA, setUnavailableA] = useState([]);
  const [unavailableB, setUnavailableB] = useState([]);
  
  const predictorRef = useRef(null);
  const shareCardRef = useRef(null);
  const [shareImageUrl, setShareImageUrl] = useState(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [upcomingMatches, setUpcomingMatches] = useState([]);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [showScoreDetailsModal, setShowScoreDetailsModal] = useState(false);

  useEffect(() => {
    if (!realGames || realGames.length === 0 || !teams) return;

    // 1. 依據真實已結束賽事，累加計算所有國家的當前大賽疲勞值、累積積分與已踢場次
    const currentFatigue = {};
    const currentPoints = {};
    const currentPlayedCount = {};
    Object.keys(teams).forEach(name => {
      currentFatigue[name] = 0.0;
      currentPoints[name] = 0;
      currentPlayedCount[name] = 0;
    });

    realGames.forEach(g => {
      if (g.finished === "TRUE") {
        const home = g.home_team_name_en;
        const away = g.away_team_name_en;
        const homeScore = parseInt(g.home_score || 0);
        const awayScore = parseInt(g.away_score || 0);
        
        if (teams[home]) {
          const bench = teams[home].has_data ? teams[home].bench_pqs : 0.2;
          currentFatigue[home] = (currentFatigue[home] || 0) + 0.04 * (1.0 - bench);
          if (g.type === 'group') {
            currentPlayedCount[home]++;
            if (homeScore > awayScore) currentPoints[home] += 3;
            else if (homeScore === awayScore) currentPoints[home] += 1;
          }
        }
        if (teams[away]) {
          const bench = teams[away].has_data ? teams[away].bench_pqs : 0.2;
          currentFatigue[away] = (currentFatigue[away] || 0) + 0.04 * (1.0 - bench);
          if (g.type === 'group') {
            currentPlayedCount[away]++;
            if (awayScore > homeScore) currentPoints[away] += 3;
            else if (awayScore === homeScore) currentPoints[away] += 1;
          }
        }
      }
    });

    // 2. 尋找所有尚未開始 (finished == "FALSE") 的比賽
    const upcoming = [...realGames]
      .filter(g => g.finished === "FALSE")
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

    setUpcomingMatches(upcoming);

    if (upcoming.length > 0) {
      let match = null;
      if (selectedMatchId) {
        match = upcoming.find(m => m.id === selectedMatchId);
      }
      if (!match) {
        match = upcoming[0];
        setSelectedMatchId(upcoming[0].id);
      }
      
      setNextMatch(match);

      const matchAnalysis = matchAnalyses?.[match.id];
      const teamA = match.home_team_name_en;
      const teamB = match.away_team_name_en;

      const tA = teams[teamA];
      const tB = teams[teamB];

      if (tA && tB) {
        setTeamAInfo(tA);
        setTeamBInfo(tB);

        const fA = currentFatigue[teamA] || 0.0;
        const fB = currentFatigue[teamB] || 0.0;
        setFatigueA(fA);
        setFatigueB(fB);

        // 3. 套用疲勞折損後的 ELO 與 PQS 算期望值
        const eloA = tA.fifa_points * (1.0 - fA * 0.05);
        const eloB = tB.fifa_points * (1.0 - fB * 0.05);
        
        // 解析傷病名單
        let unA = [];
        let unB = [];
        if (match.stats && match.stats.unavailable_players) {
          const un = match.stats.unavailable_players;
          unA = (un.home || []).map(p => p.name);
          unB = (un.away || []).map(p => p.name);
        }
        setUnavailableA(unA);
        setUnavailableB(unB);

        // 拆分攻防 PQS (受傷與板凳遞補計算)
        const activeA = getActivePqs(tA, unA, fA);
        const activeB = getActivePqs(tB, unB, fB);
        let att_pqsA = activeA.attPqs;
        let def_pqsA = activeA.defPqs;
        let att_pqsB = activeB.attPqs;
        let def_pqsB = activeB.defPqs;

        // A. 動態小組賽第三輪戰意懲罰機制 (Motivation Penalty)
        // 若該場為小組賽且該隊前兩場已取得 6 分（2勝確保晉級），則對其攻防 PQS 進行 15% 戰意折損
        if (match.type === 'group') {
          if (currentPlayedCount[teamA] === 2 && currentPoints[teamA] === 6) {
            att_pqsA *= 0.85;
            def_pqsA *= 0.85;
          }
          if (currentPlayedCount[teamB] === 2 && currentPoints[teamB] === 6) {
            att_pqsB *= 0.85;
            def_pqsB *= 0.85;
          }
        }

        // B. 戰術球風相剋矩陣 (Style Clashing Matrix)
        const styleA = tA.style || 'Standard';
        const styleB = tB.style || 'Standard';
        // 傳控 (Possession) vs 防反 (CounterAttack) -> 防反克傳控
        if (styleA === 'Possession' && styleB === 'CounterAttack') {
          att_pqsA *= 0.90; // 傳控進攻折損 10%
          att_pqsB *= 1.10; // 防反進攻提升 10%
        } else if (styleA === 'CounterAttack' && styleB === 'Possession') {
          att_pqsA *= 1.10;
          att_pqsB *= 0.90;
        }
        // 高位壓迫 (HighPress) vs 傳控 (Possession) -> 高壓克傳控
        if (styleA === 'HighPress' && styleB === 'Possession') {
          att_pqsB *= 0.95; // 傳控進攻折損 5%
          att_pqsA *= 1.05; // 壓迫進攻提升 5%
        } else if (styleA === 'Possession' && styleB === 'HighPress') {
          att_pqsA *= 0.95;
          att_pqsB *= 1.05;
        }
        // 防反 (CounterAttack) vs 高位壓迫 (HighPress) -> 高壓克防反
        if (styleA === 'HighPress' && styleB === 'CounterAttack') {
          att_pqsB *= 0.92; // 防反進攻折損 8%
          att_pqsA *= 1.08; // 壓迫進攻提升 8%
        } else if (styleA === 'CounterAttack' && styleB === 'HighPress') {
          att_pqsA *= 0.92;
          att_pqsB *= 1.08;
        }



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

        // C. 解耦 ELO 與 PQS 的共線性 (經真實盃賽擬合最優：c1 = 0.75, c2 = 0.20)
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

        // 4. 理論雙泊松概率計算與博弈貝氏融合 (Bayesian Fusion)
        const marketProb = matchAnalysis?.market_prob || null;
        const result = calculateMatchProbabilities(lambda, mu, marketProb);
        setPrediction(result);
      }
    } else {
      setNextMatch(null);
    }
  }, [realGames, teams, selectedMatchId]);

  if (!nextMatch || !prediction) {
    return (
      <div className="glass-card animate-fade-in" style={{ padding: '40px', textAlign: 'center' }}>
        <span style={{ fontSize: '48px' }}>🏁</span>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginTop: '16px' }}>世界盃所有比賽均已完賽</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>敬請期待下一屆精彩賽事！</p>
      </div>
    );
  }

  const teamA = nextMatch.home_team_name_en;
  const teamB = nextMatch.away_team_name_en;

  const isAFavored = prediction.winA >= prediction.winB;
  const topScoreItem = isAFavored ? prediction.topScoresA[0] : prediction.topScoresB[0];
  const topScoreStr = `${topScoreItem.home}:${topScoreItem.away}`;
  const topScoreProb = (topScoreItem.prob * 100).toFixed(1);

  const generateMatchAnalysis = () => {
    // 優先使用 LLM 預先生成的專家深度解析
    if (nextMatch && matchAnalyses?.[nextMatch.id]?.llm_analysis) {
      return matchAnalyses[nextMatch.id].llm_analysis;
    }

    if (!teamAInfo || !teamBInfo) return '';
    const cnA = TEAM_TRANSLATIONS?.[teamA]?.cn || teamA;
    const cnB = TEAM_TRANSLATIONS?.[teamB]?.cn || teamB;
    
    let text = `本場比賽的模型預測基於 ELO 積分等級、先發球員屬性評分 (PQS) 以及當前累計疲勞度進行雙泊松機率建模。`;
    
    // Compare ELO
    const eloDiff = Math.abs(teamAInfo.fifa_points - teamBInfo.fifa_points);
    const higherEloTeam = teamAInfo.fifa_points > teamBInfo.fifa_points ? cnA : cnB;
    
    // Compare PQS
    const pqsDiff = Math.abs(teamAInfo.starting_pqs - teamBInfo.starting_pqs);
    const higherPqsTeam = teamAInfo.starting_pqs > teamBInfo.starting_pqs ? cnA : cnB;
    
    text += ` ${higherEloTeam} 在 FIFA 積分上佔有優勢 (相差 ${eloDiff.toFixed(0)} 分)；`;
    
    if (higherPqsTeam === higherEloTeam) {
      text += `同時 ${higherPqsTeam} 的球員陣容實力評分 (PQS) 也更勝一籌 (相差 ${pqsDiff.toFixed(2)})，因此模型更加看好 ${higherPqsTeam}。`;
    } else {
      text += `然而，${higherPqsTeam} 的球員陣容實力評分 (PQS) 反而更高 (相差 ${pqsDiff.toFixed(2)})，這在一定程度上拉近了實力差距。`;
    }
    
    // Host boost
    const hostHosts = new Set(["USA", "Mexico", "Canada"]);
    if (hostHosts.has(teamA)) {
      text += ` 此外，${cnA} 作為東道主之一，獲得了額外的 +10% 進球期望值加成，主場優勢明顯。`;
    } else if (hostHosts.has(teamB)) {
      text += ` 此外，${cnB} 作為東道主之一，獲得了額外的 +10% 進球期望值加成，主場優勢明顯。`;
    }
    
    // Fatigue
    if (fatigueA > 0.01 || fatigueB > 0.01) {
      if (fatigueA > fatigueB) {
        text += ` 值得注意的是，${cnA} 當前累積了較高的疲勞度 (${(fatigueA*100).toFixed(0)}%)，這對他們的 ELO 戰力與陣容發揮造成了折扣折損。`;
      } else {
        text += ` 值得注意的是，${cnB} 當前累積了較高的疲勞度 (${(fatigueB*100).toFixed(0)}%)，這對他們的 ELO 戰力與陣容發揮造成了折扣折損。`;
      }
    }
    
    return text;
  };

  const handleShare = () => {
    if (!nextMatch || !prediction || !shareCardRef.current) return;
    setIsGeneratingImage(true);

    html2canvas(shareCardRef.current, {
      useCORS: true,
      backgroundColor: '#020617',
      scale: 2,
      logging: false
    }).then((canvas) => {
      const imgUrl = canvas.toDataURL('image/png');
      
      canvas.toBlob((blob) => {
        if (!blob) {
          setShareImageUrl(imgUrl);
          setIsGeneratingImage(false);
          return;
        }
        
        const file = new File([blob], `FIFA2026_Predict_${teamA}_vs_${teamB}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({
            files: [file],
            title: '2026 世界盃超級預測圖卡',
            text: `分享我的世界盃預測：${TEAM_TRANSLATIONS?.[teamA]?.cn} vs ${TEAM_TRANSLATIONS?.[teamB]?.cn}！`
          })
          .then(() => setIsGeneratingImage(false))
          .catch(() => {
            setShareImageUrl(imgUrl);
            setIsGeneratingImage(false);
          });
        } else {
          setShareImageUrl(imgUrl);
          setIsGeneratingImage(false);
        }
      }, 'image/png');
    }).catch((err) => {
      console.error('Generate image failed:', err);
      setIsGeneratingImage(false);
      
      const cnA = TEAM_TRANSLATIONS?.[teamA]?.cn || teamA;
      const cnB = TEAM_TRANSLATIONS?.[teamB]?.cn || teamB;
      const flagA = TEAM_TRANSLATIONS?.[teamA]?.flag || '🏳️';
      const flagB = TEAM_TRANSLATIONS?.[teamB]?.flag || '🏳️';
      
      const shareText = `【FIFA 2026 世界盃超級預測】\n` +
        `🔥 下一場對決：${flagA} ${cnA} VS ${flagB} ${cnB}\n` +
        `📅 臺灣時間：${toTaiwanTime(nextMatch.local_date)}\n\n` +
        `📊 模型預測勝率分佈：\n` +
        `  - ${cnA} 勝：${prediction.winA.toFixed(1)}%\n` +
        `  - 平局：${prediction.draw.toFixed(1)}%\n` +
        `  - ${cnB} 勝：${prediction.winB.toFixed(1)}%\n\n` +
        `🔮 最可能比分：${topScoreStr} (機率 ${topScoreProb}%)\n\n` +
        `快來看看你的隊伍預測吧！ ⚽️`;
      copyToClipboard(shareText);
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('預測結果已複製到剪貼簿，快貼給你的朋友吧！');
    }).catch(err => {
      alert('複製失敗，請手動複製。');
    });
  };

  return (
    <div className="predictor-layout animate-fade-in">
      
      {/* 🏟️ 左側欄：即將開踢賽程列表 */}
      <div className="predictor-sidebar" data-html2canvas-ignore="true">
        <h3 className="predictor-sidebar-title">
          📅 即將進行的賽程預測
        </h3>
        <div className="predictor-matches-list">
          {upcomingMatches.map((m) => {
            const isActive = m.id === selectedMatchId;
            const flagA = TEAM_TRANSLATIONS?.[m.home_team_name_en]?.flag || '🏳️';
            const flagB = TEAM_TRANSLATIONS?.[m.away_team_name_en]?.flag || '🏳️';
            const cnA = TEAM_TRANSLATIONS?.[m.home_team_name_en]?.cn || m.home_team_name_en;
            const cnB = TEAM_TRANSLATIONS?.[m.away_team_name_en]?.cn || m.away_team_name_en;
            
            return (
              <div 
                key={m.id}
                onClick={() => setSelectedMatchId(m.id)}
                className={`sidebar-match-item ${isActive ? 'active' : ''}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  <span>Match #{m.id} | {m.group ? `G組 ${m.group}` : '淘汰賽'}</span>
                  <span>{toTaiwanTime(m.local_date).split(' ')[0]}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: isActive ? 800 : 500, color: isActive ? '#fff' : 'var(--text-primary)' }}>
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{flagA} {cnA}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-secondary)', margin: '0 4px' }}>VS</span>
                  <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{flagB} {cnB}</span>
                </div>
                <div style={{ fontSize: '10px', color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)', marginTop: '6px', textAlign: 'right' }}>
                  臺灣 {toTaiwanTime(m.local_date).split(' ')[1]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🔮 右側欄：預測看板主內容 */}
      <div className="predictor-main-content">
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
          
          {/* 📸 分享卡片主體容器 (僅截圖此部分) */}
      <div ref={predictorRef} style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '12px', background: 'transparent' }}>
        
        {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800 }} className="text-gradient">🔮 下一場比賽超級預測器</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {nextMatch.type === 'group' ? `小組賽 Group ${nextMatch.group}` : `淘汰賽階段`} — Match #{nextMatch.id} | 當地時間: {nextMatch.local_date} | 臺灣時間: {toTaiwanTime(nextMatch.local_date)}
          </p>
        </div>
        <button 
          onClick={handleShare} 
          disabled={isGeneratingImage}
          data-html2canvas-ignore="true"
          className="btn-secondary" 
          style={{ 
            padding: '8px 16px', 
            fontSize: '13px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px',
            borderColor: 'var(--accent-blue)',
            color: 'var(--accent-blue)',
            cursor: 'pointer'
          }}
        >
          {isGeneratingImage ? '⏳ 正在生成圖卡...' : '🔗 分享預測圖卡'}
        </button>
      </div>

      {/* Matchup Board */}
      <div className="match-board">
        {/* Team A */}
        <div className="match-team">
          <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>{t(teamA)}</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>FIFA 排名: #{teamAInfo?.fifa_rank}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            攻: {(teamAInfo?.att_pqs || teamAInfo?.starting_pqs || 0).toFixed(2)} / 防: {(teamAInfo?.def_pqs || teamAInfo?.starting_pqs || 0).toFixed(2)}
          </p>
          <span style={{ display: 'inline-block', fontSize: '10px', color: fatigueA > 0.05 ? 'var(--accent-pink)' : 'var(--success)', background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: '12px', marginTop: '6px' }}>
            累積疲勞: {(fatigueA * 100).toFixed(0)}%
          </span>
        </div>

        {/* VS */}
        <div className="match-vs">
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px' }}>VS</span>
        </div>

        {/* Team B */}
        <div className="match-team">
          <h3 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '6px' }}>{t(teamB)}</h3>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>FIFA 排名: #{teamBInfo?.fifa_rank}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            攻: {(teamBInfo?.att_pqs || teamBInfo?.starting_pqs || 0).toFixed(2)} / 防: {(teamBInfo?.def_pqs || teamBInfo?.starting_pqs || 0).toFixed(2)}
          </p>
          <span style={{ display: 'inline-block', fontSize: '10px', color: fatigueB > 0.05 ? 'var(--accent-pink)' : 'var(--success)', background: 'rgba(255,255,255,0.03)', padding: '2px 8px', borderRadius: '12px', marginTop: '6px' }}>
            累積疲勞: {(fatigueB * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* 🚫 傷停與缺陣資訊 */}
      {(unavailableA.length > 0 || unavailableB.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
            🚫 賽前傷停與缺陣名單
          </h4>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {/* Team A */}
            <div style={{ flex: 1, minWidth: '150px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-blue)', marginBottom: '4px' }}>
                {TEAM_TRANSLATIONS?.[teamA]?.cn || teamA}
              </div>
              {unavailableA.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {unavailableA.map((name, i) => (
                    <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                      🤕 {name}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>無缺席球員</div>
              )}
            </div>
            
            {/* Team B */}
            <div style={{ flex: 1, minWidth: '150px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-pink)', marginBottom: '4px' }}>
                {TEAM_TRANSLATIONS?.[teamB]?.cn || teamB}
              </div>
              {unavailableB.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {unavailableB.map((name, i) => (
                    <div key={i} style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                      🤕 {name}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>無缺席球員</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 📊 Win/Draw/Loss Probabilities */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>勝平負機率分佈 (理論模型)</h4>
          <button 
            onClick={() => setShowScoreDetailsModal(true)}
            style={{
              padding: '4px 12px',
              fontSize: '11.5px',
              fontWeight: 800,
              borderRadius: '15px',
              background: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--accent-blue)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s ease',
              outline: 'none'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)';
              e.currentTarget.style.border = '1px solid var(--accent-blue)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
              e.currentTarget.style.border = '1px solid rgba(59, 130, 246, 0.2)';
            }}
          >
            📊 詳細比數查看
          </button>
        </div>
        
        {/* Probability bar */}
        <div style={{ display: 'flex', height: '28px', borderRadius: '14px', overflow: 'hidden', fontSize: '11px', fontWeight: 800, color: '#fff', textAlign: 'center', lineHeight: '28px' }}>
          <div style={{ width: `${prediction.winA}%`, background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {prediction.winA > 15 && `${prediction.winA.toFixed(1)}%`}
          </div>
          <div style={{ width: `${prediction.draw}%`, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            {prediction.draw > 15 && `平局 ${prediction.draw.toFixed(1)}%`}
          </div>
          <div style={{ width: `${prediction.winB}%`, background: 'var(--accent-pink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {prediction.winB > 15 && `${prediction.winB.toFixed(1)}%`}
          </div>
        </div>
        
        {/* Labels below */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '0 4px' }}>
          <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{TEAM_TRANSLATIONS?.[teamA]?.cn} 獲勝</span>
          {nextMatch.type === 'group' && <span style={{ color: 'var(--text-secondary)' }}>打平</span>}
          <span style={{ color: 'var(--accent-pink)', fontWeight: 600 }}>{TEAM_TRANSLATIONS?.[teamB]?.cn} 獲勝</span>
        </div>
      </div>

      {/* 🔮 Exact Score Predictions Top 3 */}
      <div className="score-predictions-container">
        
        {/* A wins score predictions */}
        <div className="score-prediction-col" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--accent-blue)', borderBottom: '1px solid rgba(56, 189, 248, 0.1)', paddingBottom: '6px' }}>
            {TEAM_TRANSLATIONS?.[teamA]?.cn} 獲勝最可能比分 Top 3
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {prediction.topScoresA.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ fontWeight: 800, width: '40px' }}>{item.home} : {item.away}</span>
                <div style={{ flex: 1, margin: '0 12px', height: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${(item.prob / prediction.topScoresA[0].prob) * 100}%`, height: '100%', background: 'var(--accent-blue)', borderRadius: '3px' }}></div>
                </div>
                <span style={{ color: 'var(--text-secondary)', width: '50px', textAlign: 'right', fontWeight: 600 }}>{(item.prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Draw score predictions */}
        <div className="score-prediction-col" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '6px' }}>
            平局最可能比分 Top 3
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {prediction.topScoresDraw?.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ fontWeight: 800, width: '40px' }}>{item.home} : {item.away}</span>
                <div style={{ flex: 1, margin: '0 12px', height: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${(item.prob / (prediction.topScoresDraw[0]?.prob || 1)) * 100}%`, height: '100%', background: 'var(--text-secondary)', borderRadius: '3px' }}></div>
                </div>
                <span style={{ color: 'var(--text-secondary)', width: '50px', textAlign: 'right', fontWeight: 600 }}>{(item.prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* B wins score predictions */}
        <div className="score-prediction-col" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--accent-pink)', borderBottom: '1px solid rgba(244, 63, 94, 0.1)', paddingBottom: '6px' }}>
            {TEAM_TRANSLATIONS?.[teamB]?.cn} 獲勝最可能比分 Top 3
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {prediction.topScoresB.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ fontWeight: 800, width: '40px' }}>{item.home} : {item.away}</span>
                <div style={{ flex: 1, margin: '0 12px', height: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${(item.prob / prediction.topScoresB[0].prob) * 100}%`, height: '100%', background: 'var(--accent-pink)', borderRadius: '3px' }}></div>
                </div>
                <span style={{ color: 'var(--text-secondary)', width: '50px', textAlign: 'right', fontWeight: 600 }}>{(item.prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

      </div>
      </div> {/* 📸 結束分享卡片主體容器 */}

      {/* 🔍 預測深度解析 */}
      <div className="glass-card" style={{ marginTop: '10px', padding: '20px', background: 'rgba(56, 189, 248, 0.02)', border: '1px solid rgba(56, 189, 248, 0.12)' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span>🔍</span> 預測深度解析與戰力佐證
        </h4>
        <p style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-primary)' }}>
          {generateMatchAnalysis()}
        </p>
      </div>


      {/* 💡 科普小教室：為什麼最可能比分的機率只有 {topScoreProb}%？ */}
      <div className="glass-card" style={{ padding: '20px', background: 'rgba(192, 132, 252, 0.02)', border: '1px solid rgba(192, 132, 252, 0.12)' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span>💡</span> 科普小教室：為什麼「最可能比分」的機率只有 {topScoreProb}%？
        </h4>
        <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p>
            很多球迷會疑惑：既然模型預測 <strong>{topScoreStr}</strong> 是最可能出現的比分，為什麼它的機率只有 <strong>{topScoreProb}%</strong>，而不是接近 100% 呢？這背後有三個核心統計原因：
          </p>
          <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li>
              <strong style={{ color: '#fff' }}>1. 足球是「低得分、高隨機性」的運動：</strong>
              在一場足球比賽中，進球的發生頻率極低，且受單一戰術失誤、紅黃牌或運氣影響極大。因此進球數的分佈非常廣泛，這與籃球等高得分、高容錯的運動完全不同。
            </li>
            <li>
              <strong style={{ color: '#fff' }}>2. 雙向獨立機率相乘的「相乘效應」：</strong>
              比分是雙方進球的共同結果。例如，比分 {topScoreStr} 的發生機率，是由「{TEAM_TRANSLATIONS?.[teamA]?.cn}剛好進 {topScoreItem.home} 球的機率」與「{TEAM_TRANSLATIONS?.[teamB]?.cn}剛好進 {topScoreItem.away} 球的機率」兩個獨立事件機率相乘而來。兩者相乘後，乘積必定會遠小於單邊單獨進球的機率。
            </li>
            <li>
              <strong style={{ color: '#fff' }}>3. 可能性空間被極大分散：</strong>
              足球賽事的可能比分多達數十種（如 0:0, 1:0, 0:1, 1:1, 2:0, 2:1, 0:2, 1:2 等）。總和 100% 的機率空間會被這些眾多可能性給<strong>「瓜分與稀釋」</strong>。因此，即使是出現機率最高的第一名比分，在數學上也極難超過 15% - 20%。
            </li>
          </ul>
          <p style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', fontStyle: 'italic' }}>
            💡 <strong>結論：</strong> 機率的高低是<strong>「相對」</strong>而非「絕對」的。{topScoreProb}% 的 {topScoreStr} 雖然看起來小，但相較於其他如 3:2 或 0:3 等僅有 1% 左右的冷門機率，{topScoreStr} 已經是模型在成千上萬次泊松分佈計算中，<strong>「相對最穩健、最常發生」</strong>的核心比分。
          </p>
        </div>
      </div>
      </div> {/* 閉合 glass-card */}
      </div> {/* 閉合 predictor-main-content */}

      {/* 🏆 右側欄：實時滾動奪冠機率排行榜 (大螢幕下絕對定位，窄螢幕下落於此處) */}
      <div className="predictor-rightbar" data-html2canvas-ignore="true">
        <h3 className="rightbar-title">
          🏆 實時滾動奪冠機率 Top 15
        </h3>
        <div className="rightbar-odds-list">
          {probData.probabilities?.slice(0, 15).map((item, idx) => {
            const trans = TEAM_TRANSLATIONS?.[item.team_name] || { cn: item.team_name, flag: '🏳️' };
            return (
              <div key={item.team_name} className="rightbar-odd-item">
                <span style={{ fontSize: '11px', fontWeight: 800, color: idx < 3 ? 'var(--accent-pink)' : 'var(--text-secondary)', width: '22px', textAlign: 'center' }}>
                  #{idx + 1}
                </span>
                <span style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span>{trans.flag}</span>
                  <span style={{ fontWeight: 600 }}>{trans.cn}</span>
                </span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent-blue)', width: '50px', textAlign: 'right' }}>
                  {item.Winner_pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 📸 Share Image Modal */}
      {shareImageUrl && (
        <div style={{
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
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card animate-fade-in" style={{
            maxWidth: '500px',
            width: '100%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxHeight: '90vh',
            overflowY: 'auto',
            border: '1px solid rgba(56, 189, 248, 0.2)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, textAlign: 'center' }} className="text-gradient">
              ✨ 世界盃預測分享圖卡已生成
            </h3>
            
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', textAlign: 'center' }}>
              💡 行動端可長按圖片直接保存分享，電腦端可點擊下方下載。
            </p>
            
            <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
              <img src={shareImageUrl} alt="FIFA 2026 Predict" style={{ width: '100%', display: 'block' }} />
            </div>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
              <a 
                href={shareImageUrl} 
                download={`FIFA2026_${TEAM_TRANSLATIONS?.[teamA]?.cn}_vs_${TEAM_TRANSLATIONS?.[teamB]?.cn}.png`}
                className="btn-primary"
                style={{ textDecoration: 'none', padding: '10px 20px', fontSize: '14px' }}
              >
                ⬇️ 下載預測圖卡
              </a>
              <button 
                onClick={() => setShareImageUrl(null)} 
                className="btn-secondary"
                style={{ padding: '10px 20px', fontSize: '14px' }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📊 Match Score Details Modal (Lottery Style) */}
      {showScoreDetailsModal && (
        <MatchScoreDetailsModal 
          teamA={teamA}
          teamB={teamB}
          prediction={prediction}
          onClose={() => setShowScoreDetailsModal(false)}
        />
      )}

      {/* 📸 隱藏的 4:5 分享卡片 (html2canvas 專屬截圖範圍) */}
      <div 
        ref={shareCardRef} 
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: '400px',
          height: '500px',
          background: 'linear-gradient(135deg, #0b1528 0%, #020617 100%)',
          padding: '24px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRadius: '20px',
          border: '2px solid rgba(56, 189, 248, 0.15)',
          fontFamily: "'Outfit', sans-serif"
        }}
      >
        {/* Card Top Title */}
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase' }}>
            FIFA 2026 WORLD CUP
          </span>
          <h2 style={{ fontSize: '20px', fontWeight: 900, background: 'linear-gradient(90deg, #38bdf8 0%, #c084fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '4px 0' }}>
            🔮 SUPER PREDICTOR
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
            {nextMatch.type === 'group' ? `小組賽 Group ${nextMatch.group}` : `淘汰賽`} — Match #{nextMatch.id}
          </p>
        </div>

        {/* Team Flags & VS */}
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '10px 0' }}>
          <div style={{ textAlign: 'center', width: '40%' }}>
            <span style={{ fontSize: '38px', display: 'block', marginBottom: '4px' }}>{TEAM_TRANSLATIONS?.[teamA]?.flag || '🏳️'}</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#fff', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{TEAM_TRANSLATIONS?.[teamA]?.cn || teamA}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>FIFA #{teamAInfo?.fifa_rank}</span>
          </div>
          
          <div style={{ 
            fontSize: '11px', 
            fontWeight: 800, 
            color: '#fff', 
            background: 'rgba(255,255,255,0.06)', 
            border: '1px solid rgba(255,255,255,0.1)',
            width: '32px', 
            height: '32px', 
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            VS
          </div>
          
          <div style={{ textAlign: 'center', width: '40%' }}>
            <span style={{ fontSize: '38px', display: 'block', marginBottom: '4px' }}>{TEAM_TRANSLATIONS?.[teamB]?.flag || '🏳️'}</span>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#fff', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{TEAM_TRANSLATIONS?.[teamB]?.cn || teamB}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>FIFA #{teamBInfo?.fifa_rank}</span>
          </div>
        </div>

        {/* Probabilities Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700, padding: '0 4px' }}>
            <span style={{ color: 'var(--accent-blue)' }}>{TEAM_TRANSLATIONS?.[teamA]?.cn} {prediction.winA.toFixed(0)}%</span>
            <span style={{ color: 'var(--text-secondary)' }}>平局 {prediction.draw.toFixed(0)}%</span>
            <span style={{ color: 'var(--accent-pink)' }}>{TEAM_TRANSLATIONS?.[teamB]?.cn} {prediction.winB.toFixed(0)}%</span>
          </div>
          
          <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden' }}>
            <div style={{ width: `${prediction.winA}%`, background: 'var(--accent-blue)' }}></div>
            <div style={{ width: `${prediction.draw}%`, background: 'rgba(255,255,255,0.1)' }}></div>
            <div style={{ width: `${prediction.winB}%`, background: 'var(--accent-pink)' }}></div>
          </div>
        </div>

        {/* Score Predictions Top 2 */}
        <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
          {/* Team A */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '95px' }}>
            <span style={{ fontSize: '10px', color: 'var(--accent-blue)', fontWeight: 800, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{TEAM_TRANSLATIONS?.[teamA]?.cn} 預測</span>
            {prediction.topScoresA.slice(0, 2).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ fontWeight: 800 }}>{item.home}:{item.away}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{(item.prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
          
          {/* Draw */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '95px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 800, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>平局預測</span>
            {prediction.topScoresDraw?.slice(0, 2).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ fontWeight: 800 }}>{item.home}:{item.away}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{(item.prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.06)' }}></div>
          
          {/* Team B */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '95px' }}>
            <span style={{ fontSize: '10px', color: 'var(--accent-pink)', fontWeight: 800, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{TEAM_TRANSLATIONS?.[teamB]?.cn} 預測</span>
            {prediction.topScoresB.slice(0, 2).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                <span style={{ fontWeight: 800 }}>{item.home}:{item.away}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{(item.prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card Bottom Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', fontSize: '9px', color: 'var(--text-secondary)' }}>
          <span>臺灣時間: {toTaiwanTime(nextMatch.local_date)}</span>
          <span style={{ fontWeight: 800, color: 'rgba(255,255,255,0.3)' }}>⚽ FIFA PREDICTOR 3.0</span>
        </div>
      </div>

    </div>
  );
}

