# 🏆 FIFA Predictor 4.0

FIFA Predictor 4.0 是一個針對 2026 FIFA 世界盃打造的智慧預測平台。

系統整合球員層級評分模型（PQS）、ELO 強度評估、傷停與疲勞因子、比分機率矩陣以及 10,000 次 Monte Carlo 模擬，提供比賽預測、淘汰賽推演、奪冠機率分析與賽後模型檢討。

---

## 🌍 線上展示

Demo：

https://fifa-2026-predictor-4.onrender.com

---

## ⭐ 專案亮點

### ⚽ 預測模型

- Player Quality Score（PQS）球員評分模型
- ELO Rating 球隊強度評估
- 傷停球員動態影響
- 球員疲勞累積模型
- Poisson 比分機率矩陣
- 勝 / 平 / 負機率預測

### 🏆 賽事模擬

- FIFA 2026 全新 48 隊賽制支援
- 小組賽 + 淘汰賽完整模擬
- 10,000 次 Monte Carlo Simulation
- 奪冠機率預測
- 即時淘汰賽推演
- 奪冠熱門解讀系統

### 📊 模型分析

- 預測信心等級
- 爆冷風險分析
- 賽後模型檢討
- 預測與實際結果比較
- 模型失準原因解析
- 命中率與回測統計

### 🚀 工程實作

- FastAPI 後端架構
- React + Vite 前端
- Snapshot Cache 快取機制
- Background Job System
- World Cup API 整合
- FotMob 資料同步
- Render 雲端部署
- Simulation 效能優化 33.9%

---

## 📸 系統畫面

### 首頁預測

> <img width="1840" height="1124" alt="image" src="https://github.com/user-attachments/assets/837dc0f4-7b96-4611-a564-d82f321d26d5" />


### 奪冠模擬

> <img width="1840" height="1124" alt="image" src="https://github.com/user-attachments/assets/6e849a91-60da-4fcc-9a51-4e9e501adb67" />


### 奪冠熱門解讀

> <img width="1840" height="1124" alt="截圖 2026-06-22 晚上11 43 22" src="https://github.com/user-attachments/assets/8fda2123-a7e8-4093-acee-7c0ddcfcef5c" />


### 賽後模型檢討

> <img width="1840" height="1124" alt="image" src="https://github.com/user-attachments/assets/5be485e7-b68b-401b-b462-a16f21d6fb8a" />
> <img width="1840" height="1124" alt="image" src="https://github.com/user-attachments/assets/5d75f810-9a9d-4680-b79e-e2f5ed2efe93" />


---

## 🧠 預測流程

```text
球員資料
      ↓
PQS 評分計算
      ↓
球隊強度評估
(ELO + PQS)
      ↓
傷停與疲勞調整
      ↓
Poisson 比分模型
      ↓
勝平負機率
      ↓
10,000 次 Monte Carlo 模擬
      ↓
奪冠機率與淘汰賽路徑
```

---

## 🏗️ 技術架構

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- FastAPI
- SQLAlchemy
- SQLite
- Python

### Data Sources

- FIFA World Cup API
- FotMob

### Deployment

- Render
- GitHub

---

## 📂 專案結構

```text
FIFA-2026-prediction-4.0
│
├── frontend
│   ├── src
│   ├── components
│   └── utils
│
├── backend
│   ├── app
│   ├── tests
│   ├── database
│   └── simulator
│
├── render.yaml
├── requirements.txt
└── README.md
```

---

## ⚡ 效能優化

### Monte Carlo 模擬

原始版本：

```text
10,000 次模擬
≈ 691 秒
```

優化後：

```text
10,000 次模擬
≈ 463 秒
```

改善幅度：

```text
33.9%
```

主要優化：

- Real Game Lookup Index
- PMF Cache
- Matrix Reuse
- Active PQS Cache
- Snapshot Cache
- Compact Probability Matrix
- Fused Mix + Sampling

---

## 📈 核心功能

### 比賽預測

- 勝平負機率
- 預測比分
- 信心等級
- 爆冷風險分析

### 奪冠模擬

- 奪冠機率
- 晉級機率
- 淘汰賽路徑分析
- 熱門球隊比較

### 賽後檢討

- 預測 vs 實際比分
- 機率排名
- 意外程度分析
- 模型觀察

---

## 🔮 未來規劃

- 小組賽階段模型表現分析
- 淘汰賽階段模型表現分析
- 自動生成賽事報告
- 模型版本比較
- 長期預測回測系統
- AI 賽事解讀增強
- PostgreSQL 支援
- Background Worker 架構

---

## 👨‍💻 作者

劉耀升  
National Taiwan Ocean University  
Department of Computer Science and Engineering

GitHub：

https://github.com/wilson94624

---

## 📄 License

MIT License
