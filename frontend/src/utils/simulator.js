/**
 * FIFA 2026 世界盃預測模擬引擎 (3.0 網站版 - 邏輯模組)
 */

import matchAnalyses from '../match_analyses.json';
import { calculateMatchProbabilities } from './poissonMath';

// 國名映射
const hostHosts = new Set(["USA", "Mexico", "Canada"]);

// 階乘計算與泊松隨機數抽樣
const factorial = (n) => {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
};

const getPoisson = (l) => {
  const L = Math.exp(-l);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
};

const getActivePqs = (teamData, unavailableNames = [], fatigueVal = 0.0) => {
  if (!teamData.has_data) {
    const pqs = teamData.starting_pqs || 0.5;
    return {
      attPqs: pqs * (1.0 - fatigueVal),
      defPqs: pqs * (1.0 - fatigueVal),
      benchPqs: teamData.bench_pqs || 0.2
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

  // 按 efficiency_score 降序排序
  const sortedPlayers = [...finalActive].sort((a, b) => b.efficiency_score - a.efficiency_score);
  const starters = sortedPlayers.slice(0, 11);
  const bench = sortedPlayers.slice(11);

  const fwMf = starters.filter(p => p.position === 'FW' || p.position === 'MF');
  const dfGk = starters.filter(p => p.position === 'DF' || p.position === 'GK');

  const attPqs = fwMf.length > 0 ? fwMf.reduce((sum, p) => sum + p.efficiency_score, 0) / fwMf.length : (teamData.starting_pqs || 0.5);
  const defPqs = dfGk.length > 0 ? dfGk.reduce((sum, p) => sum + p.efficiency_score, 0) / dfGk.length : (teamData.starting_pqs || 0.5);
  const benchPqs = bench.length > 0 ? bench.reduce((sum, p) => sum + p.efficiency_score, 0) / bench.length : 0.01;

  return {
    attPqs: attPqs * (1.0 - fatigueVal),
    defPqs: defPqs * (1.0 - fatigueVal),
    benchPqs: benchPqs
  };
};

// 解析 API 回傳的真實進球人字串，如 "{\“J. Quiñones 9'\”,\”R. Jiménez 67'\”}"
export const parseRealScorers = (scorersStr) => {
  if (!scorersStr || scorersStr === "null" || scorersStr === "undefined") return [];
  try {
    // 移除大括弧、引號等
    let clean = scorersStr.replace(/[{}"'\\]/g, '');
    clean = clean.replace(/[“”]/g, ''); // 移除中文雙引號
    const parts = clean.split(',').map(s => s.trim()).filter(Boolean);
    
    return parts.map(part => {
      // 提取名字與分鐘，例如 "J. Quiñones 9'"
      const match = part.match(/(.+?)\s+(\d+)\'?/);
      if (match) {
        return {
          name: match[1].trim(),
          min: parseInt(match[2]),
          position: 'FW'
        };
      }
      return { name: part, min: 45, position: 'FW' }; // fallback
    }).sort((a, b) => a.min - b.min);
  } catch (e) {
    return [];
  }
};

/**
 * 真實大賽表現動態更新模型：依據真實賽果更新球員屬性與團隊戰力 (PQS)
 * @param {object} teams 初始 teams 資料庫
 * @param {array} realGames 真實比賽列表
 * @returns {object} 更新後的 teams 資料庫複本
 */
export const applyRealPerformanceBoost = (teams, realGames) => {
  const updatedTeams = JSON.parse(JSON.stringify(teams));
  
  if (!realGames || realGames.length === 0) return updatedTeams;

  // 遍歷已結束的真實比賽
  realGames.forEach(game => {
    if (game.finished !== "TRUE") return;

    const home = game.home_team_name_en;
    const away = game.away_team_name_en;
    const homeScore = parseInt(game.home_score || 0);
    const awayScore = parseInt(game.away_score || 0);

    const tHome = updatedTeams[home];
    const tAway = updatedTeams[away];

    if (!tHome || !tAway) return;

    // 1. 大賽基本經驗提升 (+0.01 PQS)
    if (tHome.has_data) {
      tHome.players.forEach(p => p.efficiency_score += 0.01);
    }
    if (tAway.has_data) {
      tAway.players.forEach(p => p.efficiency_score += 0.01);
    }

    // 2. 進球爆發加成 (+0.2 PQS / 球)
    const homeScorers = parseRealScorers(game.home_scorers);
    homeScorers.forEach(scorer => {
      if (tHome.has_data) {
        // 部分名字匹配
        const pObj = tHome.players.find(p => p.name.includes(scorer.name) || scorer.name.includes(p.name));
        if (pObj) {
          pObj.efficiency_score += 0.20;
        } else {
          // 若沒對齊到名字，就隨機加給前鋒以保持戰力同步
          const fw = tHome.players.find(p => p.position === 'FW' || p.position === 'MF');
          if (fw) fw.efficiency_score += 0.20;
        }
      }
    });

    const awayScorers = parseRealScorers(game.away_scorers);
    awayScorers.forEach(scorer => {
      if (tAway.has_data) {
        const pObj = tAway.players.find(p => p.name.includes(scorer.name) || scorer.name.includes(p.name));
        if (pObj) {
          pObj.efficiency_score += 0.20;
        } else {
          const fw = tAway.players.find(p => p.position === 'FW' || p.position === 'MF');
          if (fw) fw.efficiency_score += 0.20;
        }
      }
    });

    // 3. 門將零封加成
    if (tHome.has_data) {
      const gk = tHome.players.find(p => p.position === 'GK');
      if (gk) {
        if (awayScore === 0) gk.overall += 2; // 零封
        else if (awayScore >= 3) gk.overall = Math.max(60, gk.overall - 1); // 丟球多
      }
    }
    if (tAway.has_data) {
      const gk = tAway.players.find(p => p.position === 'GK');
      if (gk) {
        if (homeScore === 0) gk.overall += 2;
        else if (homeScore >= 3) gk.overall = Math.max(60, gk.overall - 1);
      }
    }

    // 4. 重新計算 starting_pqs, bench_pqs, att_pqs, def_pqs 反映最新狀態
    if (tHome.has_data) {
      const sorted = [...tHome.players].sort((a, b) => b.efficiency_score - a.efficiency_score);
      const starters = sorted.slice(0, 11);
      tHome.starting_pqs = starters.reduce((sum, p) => sum + p.efficiency_score, 0) / 11;
      tHome.bench_pqs = sorted.slice(11).reduce((sum, p) => sum + p.efficiency_score, 0) / 15;
      
      const fw_mf = starters.filter(p => p.position === 'FW' || p.position === 'MF');
      const df_gk = starters.filter(p => p.position === 'DF' || p.position === 'GK');
      tHome.att_pqs = fw_mf.length > 0 ? fw_mf.reduce((sum, p) => sum + p.efficiency_score, 0) / fw_mf.length : tHome.starting_pqs;
      tHome.def_pqs = df_gk.length > 0 ? df_gk.reduce((sum, p) => sum + p.efficiency_score, 0) / df_gk.length : tHome.starting_pqs;
    }
    if (tAway.has_data) {
      const sorted = [...tAway.players].sort((a, b) => b.efficiency_score - a.efficiency_score);
      const starters = sorted.slice(0, 11);
      tAway.starting_pqs = starters.reduce((sum, p) => sum + p.efficiency_score, 0) / 11;
      tAway.bench_pqs = sorted.slice(11).reduce((sum, p) => sum + p.efficiency_score, 0) / 15;
      
      const fw_mf = starters.filter(p => p.position === 'FW' || p.position === 'MF');
      const df_gk = starters.filter(p => p.position === 'DF' || p.position === 'GK');
      tAway.att_pqs = fw_mf.length > 0 ? fw_mf.reduce((sum, p) => sum + p.efficiency_score, 0) / fw_mf.length : tAway.starting_pqs;
      tAway.def_pqs = df_gk.length > 0 ? df_gk.reduce((sum, p) => sum + p.efficiency_score, 0) / df_gk.length : tAway.starting_pqs;
    }
  });

  return updatedTeams;
};

/**
 * 核心預測模擬器 (已完賽則套用真實賽果，未完賽則隨機泊松)
 */
export const playMatch = (teamA, teamB, teams, currentFatigue, realGames, stageType = 'group') => {
  const tA = teams[teamA];
  const tB = teams[teamB];

  // 1. 優先檢查真實世界是否已完賽 (finished == "TRUE")
  const realGame = realGames?.find(g => 
    g.finished === "TRUE" && 
    g.type === stageType &&
    ((g.home_team_name_en === teamA && g.away_team_name_en === teamB) ||
     (g.home_team_name_en === teamB && g.away_team_name_en === teamA))
  );

  if (realGame) {
    const isHomeA = realGame.home_team_name_en === teamA;
    const goalsA = isHomeA ? parseInt(realGame.home_score) : parseInt(realGame.away_score);
    const goalsB = isHomeA ? parseInt(realGame.away_score) : parseInt(realGame.home_score);
    
    // 解析真實進球球員
    const scorersA = isHomeA ? parseRealScorers(realGame.home_scorers) : parseRealScorers(realGame.away_scorers);
    const scorersB = isHomeA ? parseRealScorers(realGame.away_scorers) : parseRealScorers(realGame.home_scorers);

    // 判定勝負
    let winner = null;
    if (goalsA > goalsB) winner = teamA;
    else if (goalsB > goalsA) winner = teamB;
    else winner = stageType === 'group' ? 'DRAW' : teamA; // 淘汰賽強制給一個 winner（真實世界點球）

    // 疲勞計算
    const fA = currentFatigue[teamA] || 0.0;
    const fB = currentFatigue[teamB] || 0.0;
    const benchA = tA.has_data ? tA.bench_pqs : 0.2;
    const benchB = tB.has_data ? tB.bench_pqs : 0.2;
    
    const nextFatigueA = fA + 0.04 * (1.0 - benchA);
    const nextFatigueB = fB + 0.04 * (1.0 - benchB);

    // 1. 優先使用爬蟲獲得的真實高階數據 (stats)
    if (realGame.stats && 
        typeof realGame.stats.possessionA !== 'undefined' && 
        typeof realGame.stats.shotsA !== 'undefined') {
      
      const possessionA = isHomeA ? realGame.stats.possessionA : realGame.stats.possessionB;
      const possessionB = isHomeA ? realGame.stats.possessionB : realGame.stats.possessionA;
      const shotsA = isHomeA ? realGame.stats.shotsA : realGame.stats.shotsB;
      const shotsB = isHomeA ? realGame.stats.shotsB : realGame.stats.shotsA;
      const foulsA = isHomeA ? realGame.stats.foulsA : realGame.stats.foulsB;
      const foulsB = isHomeA ? realGame.stats.foulsB : realGame.stats.foulsA;

      return {
        teamA, teamB, goalsA, goalsB, scorersA, scorersB, winner,
        extraTime: false, penScore: null,
        stats: {
          possessionA, possessionB,
          shotsA: Math.max(1, shotsA), shotsB: Math.max(1, shotsB),
          foulsA, foulsB
        },
        updatedFatigue: {
          [teamA]: nextFatigueA,
          [teamB]: nextFatigueB
        }
      };
    }

    // 2. Fallback: 根據雙方實力 PQS 與真實比分動態計算控球率與射門，避免寫死 50/50
    const pqsA = (tA.att_pqs || tA.starting_pqs || 0.5);
    const pqsDefA = (tA.def_pqs || tA.starting_pqs || 0.5);
    const pqsB = (tB.att_pqs || tB.starting_pqs || 0.5);
    const pqsDefB = (tB.def_pqs || tB.starting_pqs || 0.5);
    
    const avgPqsA = (pqsA + pqsDefA) / 2;
    const avgPqsB = (pqsB + pqsDefB) / 2;
    
    const goalDiff = goalsA - goalsB;
    let possession = Math.floor(50 + (avgPqsA - avgPqsB) * 100 + goalDiff * 2 + (Math.random() - 0.5) * 8);
    possession = Math.max(30, Math.min(70, possession));
    
    const totalShots = Math.floor(Math.random() * 15) + 12;
    const shotsA_exp = Math.floor(totalShots * (possession / 100)) + goalsA;
    const shotsB_exp = totalShots - shotsA_exp + goalsB;
    
    const shotsA = Math.max(goalsA, shotsA_exp);
    const shotsB = Math.max(goalsB, shotsB_exp);
    const foulsA = Math.floor(Math.random() * 8) + 6 + (possession < 45 ? 3 : 0);
    const foulsB = Math.floor(Math.random() * 8) + 6 + (possession >= 55 ? 3 : 0);

    return {
      teamA, teamB, goalsA, goalsB, scorersA, scorersB, winner,
      extraTime: false, penScore: null,
      stats: {
        possessionA: possession, possessionB: 100 - possession,
        shotsA: Math.max(1, shotsA), shotsB: Math.max(1, shotsB),
        foulsA, foulsB
      },
      updatedFatigue: {
        [teamA]: nextFatigueA,
        [teamB]: nextFatigueB
      }
    };
  }

  // 2. 處理無大名單國家的輪空邏輯 (對齊 Python)
  if (!tA.has_data || !tB.has_data) {
    if (!tA.has_data && !tB.has_data) {
      const winner = stageType !== 'group' ? teamA : 'DRAW';
      return {
        teamA, teamB, goalsA: 0, goalsB: 0, scorersA: [], scorersB: [],
        winner, extraTime: false, penScore: null,
        stats: { possessionA: 50, possessionB: 50, shotsA: 0, shotsB: 0, foulsA: 0, foulsB: 0 },
        updatedFatigue: { [teamA]: currentFatigue[teamA] || 0.0, [teamB]: currentFatigue[teamB] || 0.0 }
      };
    }
    if (!tA.has_data) {
      return {
        teamA, teamB, goalsA: 0, goalsB: 3, scorersA: [],
        scorersB: Array.from({ length: 3 }, (_, i) => ({ name: `Default Player ${i+1}`, min: 10 * (i + 1), position: 'FW' })),
        winner: teamB, extraTime: false, penScore: null,
        stats: { possessionA: 30, possessionB: 70, shotsA: 2, shotsB: 15, foulsA: 10, foulsB: 5 },
        updatedFatigue: { [teamA]: currentFatigue[teamA] || 0.0, [teamB]: currentFatigue[teamB] || 0.0 }
      };
    }
    if (!tB.has_data) {
      return {
        teamA, teamB, goalsA: 3, goalsB: 0,
        scorersA: Array.from({ length: 3 }, (_, i) => ({ name: `Default Player ${i+1}`, min: 10 * (i + 1), position: 'FW' })),
        scorersB: [], winner: teamA, extraTime: false, penScore: null,
        stats: { possessionA: 70, possessionB: 30, shotsA: 15, shotsB: 2, foulsA: 5, foulsB: 10 },
        updatedFatigue: { [teamA]: currentFatigue[teamA] || 0.0, [teamB]: currentFatigue[teamB] || 0.0 }
      };
    }
  }

  // 3. 正常隨機雙泊松模擬
  const fA = currentFatigue[teamA] || 0.0;
  const fB = currentFatigue[teamB] || 0.0;

  const eloA = tA.fifa_points * (1.0 - fA * 0.05);
  const eloB = tB.fifa_points * (1.0 - fB * 0.05);
  
  // 獲取傷停名單 (如果有)
  let unavailableA = [];
  let unavailableB = [];
  if (realGames && realGames.length > 0) {
    const rG = realGames.find(g => 
      ((g.home_team_name_en === teamA && g.away_team_name_en === teamB) ||
       (g.home_team_name_en === teamB && g.away_team_name_en === teamA))
    );
    if (rG && rG.stats && rG.stats.unavailable_players) {
      const un = rG.stats.unavailable_players;
      const isHomeA = rG.home_team_name_en === teamA;
      if (isHomeA) {
        unavailableA = (un.home || []).map(p => p.name);
        unavailableB = (un.away || []).map(p => p.name);
      } else {
        unavailableA = (un.away || []).map(p => p.name);
        unavailableB = (un.home || []).map(p => p.name);
      }
    }
  }

  // 拆分攻防與替補 PQS (受傷與板凳遞補計算)
  const activeA = getActivePqs(tA, unavailableA, fA);
  const activeB = getActivePqs(tB, unavailableB, fB);
  let att_pqsA = activeA.attPqs;
  let def_pqsA = activeA.defPqs;
  let bench_pqsA = activeA.benchPqs;
  let att_pqsB = activeB.attPqs;
  let def_pqsB = activeB.defPqs;
  let bench_pqsB = activeB.benchPqs;

  // A. 動態小組賽第三輪戰意懲罰機制 (Motivation Penalty)
  const currentPoints = { [teamA]: 0, [teamB]: 0 };
  const currentPlayedCount = { [teamA]: 0, [teamB]: 0 };
  if (realGames && realGames.length > 0) {
    realGames.forEach(g => {
      if (g.finished === "TRUE" && g.type === 'group') {
        const home = g.home_team_name_en;
        const away = g.away_team_name_en;
        const homeScore = parseInt(g.home_score || 0);
        const awayScore = parseInt(g.away_score || 0);
        
        if (home === teamA) {
          currentPlayedCount[teamA]++;
          if (homeScore > awayScore) currentPoints[teamA] += 3;
          else if (homeScore === awayScore) currentPoints[teamA] += 1;
        } else if (away === teamA) {
          currentPlayedCount[teamA]++;
          if (awayScore > homeScore) currentPoints[teamA] += 3;
          else if (awayScore === homeScore) currentPoints[teamA] += 1;
        }
        
        if (home === teamB) {
          currentPlayedCount[teamB]++;
          if (homeScore > awayScore) currentPoints[teamB] += 3;
          else if (homeScore === awayScore) currentPoints[teamB] += 1;
        } else if (away === teamB) {
          currentPlayedCount[teamB]++;
          if (awayScore > homeScore) currentPoints[teamB] += 3;
          else if (awayScore === homeScore) currentPoints[teamB] += 1;
        }
      }
    });
  }

  if (stageType === 'group') {
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

  // 讀取博弈市場機率
  let marketProb = null;
  if (matchAnalyses) {
    const matchedAnalysis = Object.values(matchAnalyses).find(
      a => a.home === teamA && a.away === teamB
    );
    if (matchedAnalysis) {
      marketProb = matchedAnalysis.market_prob || null;
    }
  }

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

  // 透過 poissonMath 模組計算 Dixon-Coles 修正與博弈貝氏融合後的聯合概率分布進行隨機比分抽樣
  const probRes = calculateMatchProbabilities(lambda, mu, marketProb);
  const scoreList = probRes.scoreList;
  
  let rand = Math.random();
  let selectedScore = scoreList[scoreList.length - 1];
  for (const s of scoreList) {
    rand -= s.prob;
    if (rand <= 0) {
      selectedScore = s;
      break;
    }
  }
  let goalsA = selectedScore.home;
  let goalsB = selectedScore.away;

  // 模擬進球員產生器
  const generateScorers = (teamName, goalCount) => {
    if (goalCount <= 0) return [];
    const team = teams[teamName];
    if (!team) return [];
    const players = team.players;
    const scorers = [];
    for (let i = 0; i < goalCount; i++) {
      const totalWeight = players.reduce((sum, p) => sum + p.efficiency_score, 0);
      let rand = Math.random() * totalWeight;
      let selectedPlayer = players[players.length - 1];
      for (const p of players) {
        rand -= p.efficiency_score;
        if (rand <= 0) {
          selectedPlayer = p;
          break;
        }
      }
      scorers.push({ name: selectedPlayer.name, min: Math.floor(Math.random() * 90) + 1, position: selectedPlayer.position });
    }
    return scorers.sort((a, b) => a.min - b.min);
  };

  const scorersA = generateScorers(teamA, goalsA);
  const scorersB = generateScorers(teamB, goalsB);

  let winner = null;
  let penScore = null;
  let extraTime = false;

  if (goalsA > goalsB) {
    winner = teamA;
  } else if (goalsB > goalsA) {
    winner = teamB;
  } else {
    if (stageType !== 'group') {
      extraTime = true;
      const extraA = getPoisson(lambda * 0.33);
      const extraB = getPoisson(mu * 0.33);
      goalsA += extraA;
      goalsB += extraB;

      if (extraA > 0) {
        scorersA.push(...generateScorers(teamA, extraA).map(s => ({ ...s, min: Math.floor(Math.random() * 30) + 91 })));
      }
      if (extraB > 0) {
        scorersB.push(...generateScorers(teamB, extraB).map(s => ({ ...s, min: Math.floor(Math.random() * 30) + 91 })));
      }

      if (goalsA > goalsB) {
        winner = teamA;
      } else if (goalsB > goalsA) {
        winner = teamB;
      } else {
        // PK 大戰門將與射手對抗
        const gkA = Math.max(...(tA.players.filter(p => p.position === 'GK').map(p => p.overall)), 60);
        const gkB = Math.max(...(tB.players.filter(p => p.position === 'GK').map(p => p.overall)), 60);
        const shootersAArr = tA.players.filter(p => p.position !== 'GK').map(p => p.overall).sort((a, b) => b - a).slice(0, 5);
        const shootersBArr = tB.players.filter(p => p.position !== 'GK').map(p => p.overall).sort((a, b) => b - a).slice(0, 5);

        const shootersAOvr = shootersAArr.length > 0 ? shootersAArr.reduce((sum, val) => sum + val, 0) / shootersAArr.length : 65;
        const shootersBOvr = shootersBArr.length > 0 ? shootersBArr.reduce((sum, val) => sum + val, 0) / shootersBArr.length : 65;

        const rateA = Math.max(0.55, Math.min(0.90, 0.75 + (shootersAOvr - gkB) / 200.0));
        const rateB = Math.max(0.55, Math.min(0.90, 0.75 + (shootersBOvr - gkA) / 200.0));

        let penA = 0, penB = 0;
        for (let r = 0; r < 5; r++) {
          if (Math.random() < rateA) penA++;
          if (Math.random() < rateB) penB++;
        }
        while (penA === penB) {
          if (Math.random() < rateA) penA++;
          if (Math.random() < rateB) penB++;
        }
        penScore = { a: penA, b: penB };
        winner = penA > penB ? teamA : teamB;
      }
    } else {
      winner = 'DRAW';
    }
  }

  const avgPqsA = (att_pqsA + def_pqsA) / 2;
  const avgPqsB = (att_pqsB + def_pqsB) / 2;
  const possession = Math.max(30, Math.min(70, Math.floor(50 + (avgPqsA - avgPqsB) * 1.5 + (Math.random() - 0.5) * 10)));
  const totalShots = Math.floor(Math.random() * 15) + 12;
  const shotsA = Math.floor(totalShots * (possession / 100));
  const shotsB = totalShots - shotsA;

  // 疲勞累積
  const benchA = tA.has_data ? bench_pqsA : 0.2;
  const benchB = tB.has_data ? bench_pqsB : 0.2;
  const nextFatigueA = fA + 0.04 * (1.0 - benchA) + (extraTime ? 0.02 : 0.0);
  const nextFatigueB = fB + 0.04 * (1.0 - benchB) + (extraTime ? 0.02 : 0.0);

  return {
    teamA, teamB, goalsA, goalsB, scorersA, scorersB, winner, extraTime, penScore,
    stats: {
      possessionA: possession, possessionB: 100 - possession,
      shotsA: Math.max(1, shotsA), shotsB: Math.max(1, shotsB),
      foulsA: Math.floor(Math.random() * 10) + 6, foulsB: Math.floor(Math.random() * 10) + 6
    },
    updatedFatigue: {
      [teamA]: nextFatigueA,
      [teamB]: nextFatigueB
    }
  };
};
