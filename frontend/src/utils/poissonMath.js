/**
 * 雙泊松分佈理論概率計算器 (含 Dixon-Coles 修正)
 */

// 階乘計算
const factorial = (n) => {
  if (n <= 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
};

// 泊松機率質量函數 (PMF)
const poissonPMF = (k, lambda) => {
  if (k < 0) return 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
};

/**
 * 計算兩隊比分的理論機率矩陣，並得出勝平負與比分 Top 3 機率
 * @param {number} lambda A 隊進球期望值
 * @param {number} mu B 隊進球期望值
 * @returns {object} { winA, draw, winB, topScoresA, topScoresB }
 */
export const calculateMatchProbabilities = (lambda, mu, marketProb = null) => {
  const maxGoals = 5; // 計算到 5 球
  const matrix = [];
  const gamma = 0.08; // 雙變量泊松協方差常數
  
  // Dixon-Coles 平局修正參數 rho
  const rho = -0.05; 
  const dcCorrection = (x, y, p) => {
    if (x === 0 && y === 0) return p * (1.0 - rho * lambda * mu);
    if (x === 1 && y === 1) return p * (1.0 - rho);
    if (x === 1 && y === 0) return p * (1.0 + rho * mu);
    if (x === 0 && y === 1) return p * (1.0 + rho * lambda);
    return p;
  };

  // 雙變量泊松 PMF 計算 (三變量法，防範除零與負期望值)
  const bivariatePoissonPMF = (x, y) => {
    const g = Math.max(0, Math.min(gamma, lambda - 0.01, mu - 0.01));
    const lam1 = lambda - g;
    const lam2 = mu - g;
    const lam3 = g;
    
    let sum = 0;
    const minXY = Math.min(x, y);
    for (let k = 0; k <= minXY; k++) {
      const p1 = poissonPMF(x - k, lam1);
      const p2 = poissonPMF(y - k, lam2);
      const p3 = poissonPMF(k, lam3);
      sum += p1 * p2 * p3;
    }
    return sum;
  };

  let winA = 0;
  let winB = 0;
  let draw = 0;

  const scoreList = [];

  for (let x = 0; x <= maxGoals; x++) {
    for (let y = 0; y <= maxGoals; y++) {
      let prob = bivariatePoissonPMF(x, y);
      
      // 套用 Dixon-Coles 修正
      prob = Math.max(0, dcCorrection(x, y, prob));
      
      scoreList.push({ home: x, away: y, prob });

      if (x > y) {
        winA += prob;
      } else if (y > x) {
        winB += prob;
      } else {
        draw += prob;
      }
    }
  }

  // 套用貝氏市場概率更新 (Bayesian Fusion)
  if (marketProb && typeof marketProb.winA !== 'undefined' && typeof marketProb.draw !== 'undefined' && typeof marketProb.winB !== 'undefined') {
    const mA = marketProb.winA;
    const mD = marketProb.draw;
    const mB = marketProb.winB;
    const sumMarket = mA + mD + mB;
    if (sumMarket > 0) {
      let bayesTotal = 0;
      scoreList.forEach(s => {
        if (s.home > s.away) {
          s.prob = s.prob * (mA / sumMarket);
        } else if (s.away > s.home) {
          s.prob = s.prob * (mB / sumMarket);
        } else {
          s.prob = s.prob * (mD / sumMarket);
        }
        bayesTotal += s.prob;
      });
      
      // 重新歸一化並計算大盤勝率
      winA = 0;
      winB = 0;
      draw = 0;
      scoreList.forEach(s => {
        s.prob = s.prob / (bayesTotal || 1);
        if (s.home > s.away) winA += s.prob;
        else if (s.away > s.home) winB += s.prob;
        else draw += s.prob;
      });
    }
  } else {
    // 正常無博弈隱含賠率時的歸一化
    const total = winA + winB + draw;
    winA = winA / total;
    winB = winB / total;
    draw = draw / total;
    scoreList.forEach(s => {
      s.prob = s.prob / total;
    });
  }

  // 分離出 A 勝、B 勝與平局的比分，並進行概率排序
  const scoreListA = scoreList.filter(s => s.home > s.away);
  const scoreListB = scoreList.filter(s => s.away > s.home);
  const scoreListDraw = scoreList.filter(s => s.home === s.away);

  // 排序取前 3 名
  const topScoresA = [...scoreListA].sort((a, b) => b.prob - a.prob).slice(0, 3);
  const topScoresB = [...scoreListB].sort((a, b) => b.prob - a.prob).slice(0, 3);
  const topScoresDraw = [...scoreListDraw].sort((a, b) => b.prob - a.prob).slice(0, 3);

  return {
    winA: winA * 100,
    winB: winB * 100,
    draw: draw * 100,
    topScoresA,
    topScoresB,
    topScoresDraw,
    scoreList
  };
};
