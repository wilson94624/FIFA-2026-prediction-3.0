# -*- coding: utf-8 -*-
import json
import os
import requests
import urllib3
from datetime import datetime, timedelta

# 忽略未驗證 HTTPS 請求的警告 (當 fallback verify=False 時使用)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

API_URL = "https://worldcup26.ir/get/games"
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(BACKEND_DIR)
OUTPUT_PATH = os.path.join(BASE_DIR, "frontend/src/real_games_results.json")

# 國名對齊映射字典
api_to_local_names = {
    'United States': 'USA',
    'Czech Republic': 'Czechia',
    'Cape Verde': 'Cabo Verde',
    'Democratic Republic of the Congo': 'Congo DR',
    'Curaçao': 'Curacao'
}

# 本地國名到 FotMob 國名映射
local_to_fotmob_names = {
    'Cabo Verde': 'Cape Verde',
    'Congo DR': 'DR Congo',
    'Turkey': 'Turkiye',
}

def align_name(name):
    if not name:
        return name
    return api_to_local_names.get(name, name)

def get_fotmob_stats(home_team, away_team, local_date_str):
    """
    從 FotMob API 動態爬取該日期的特定賽事高階數據 (Possession, Shots, Fouls)
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.fotmob.com/",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
    }
    
    # 1. 解析日期並生成 3 個待搜尋的日期 (當天、隔天、前天)
    from datetime import datetime, timedelta
    try:
        date_part = local_date_str.split()[0]
        mm, dd, yyyy = date_part.split('/')
        base_date = datetime(int(yyyy), int(mm), int(dd))
        search_dates = [
            base_date.strftime("%Y%m%d"),
            (base_date + timedelta(days=1)).strftime("%Y%m%d"),
            (base_date - timedelta(days=1)).strftime("%Y%m%d")
        ]
    except Exception as e:
        print(f"   [FotMob] 日期格式解析失敗 '{local_date_str}': {e}")
        return None

    # 2. 轉換為 FotMob 的名稱對齊
    fm_home = local_to_fotmob_names.get(home_team, home_team)
    fm_away = local_to_fotmob_names.get(away_team, away_team)

    # 3. 嘗試在三個日期中尋找匹配的世界盃對局
    match_id = None
    is_reversed = False
    found_date = None
    
    for d_str in search_dates:
        matches_url = f"https://www.fotmob.com/api/data/matches?date={d_str}"
        try:
            response = requests.get(matches_url, headers=headers, timeout=10)
            if response.status_code != 200:
                continue
            
            data = response.json()
            # 尋找匹配的世界盃對局
            leagues_list = data.get("leagues") or []
            for league in leagues_list:
                if not league:
                    continue
                if "world cup" in (league.get("name") or "").lower():
                    matches_list = league.get("matches") or []
                    for m in matches_list:
                        if not m:
                            continue
                        home_info = m.get("home") or {}
                        away_info = m.get("away") or {}
                        m_home = home_info.get("name")
                        m_away = away_info.get("name")
                        
                        if m_home == fm_home and m_away == fm_away:
                            match_id = m.get("id")
                            is_reversed = False
                            break
                        elif m_home == fm_away and m_away == fm_home:
                            match_id = m.get("id")
                            is_reversed = True
                            break
                    if match_id:
                        break
            if match_id:
                found_date = d_str
                break
        except Exception:
            continue
            
    if not match_id:
        print(f"   [FotMob] 未找到與 {home_team} vs {away_team} (嘗試日期: {search_dates}) 匹配的 FotMob 賽事")
        return None

    # 5. 抓取單場詳情
    try:
        details_url = f"https://www.fotmob.com/api/data/matchDetails?matchId={match_id}"
        detail_response = requests.get(details_url, headers=headers, timeout=10)
        if detail_response.status_code != 200:
            return None
            
        detail_data = detail_response.json()
        content = detail_data.get("content") or {}
        stats_wrapper = content.get("stats") or {}
        periods = stats_wrapper.get("Periods") or {}
        all_period = periods.get("All") or {}
        stats_list = all_period.get("stats") or []
        
        possession = None
        shots = None
        fouls = None
        
        for section in stats_list:
            sec_stats = section.get("stats", [])
            for item in sec_stats:
                title = item.get("title", "")
                if title == "Ball possession":
                    possession = item.get("stats")
                elif title == "Total shots":
                    shots = item.get("stats")
                elif title == "Fouls committed":
                    fouls = item.get("stats")

        # 6. 解析與回傳
        # 獲取傷兵名單 (不管完賽與否)
        content = detail_data.get("content") or {}
        lineup = content.get("lineup") or {}
        home_team_data = lineup.get("homeTeam") or {}
        away_team_data = lineup.get("awayTeam") or {}
        home_unavailable = home_team_data.get("unavailable") or []
        away_unavailable = away_team_data.get("unavailable") or []
        
        def parse_unavailable(un_list):
            if not un_list:
                return []
            out = []
            for p in un_list:
                if not p:
                    continue
                name = p.get("name")
                un_type = p.get("unavailability", {}).get("type", "injury") if p.get("unavailability") else "injury"
                if name:
                    out.append({
                        "name": name,
                        "type": un_type
                    })
            return out
            
        unavailable_players = {
            "home": parse_unavailable(home_unavailable),
            "away": parse_unavailable(away_unavailable)
        }
        
        if is_reversed:
            unavailable_players = {
                "home": unavailable_players["away"],
                "away": unavailable_players["home"]
            }

        if possession and shots:
            p_home, p_away = possession[0], possession[1]
            s_home, s_away = shots[0], shots[1]
            f_home, f_away = (fouls[0] if fouls else 10), (fouls[1] if fouls else 10)
            
            if is_reversed:
                p_home, p_away = p_away, p_home
                s_home, s_away = s_away, s_home
                f_home, f_away = f_away, f_home
                
            print(f"   [FotMob] 成功獲取 {home_team} vs {away_team} 高階數據與傷停名單")
            return {
                "possessionA": int(p_home),
                "possessionB": int(p_away),
                "shotsA": int(s_home),
                "shotsB": int(s_away),
                "foulsA": int(f_home),
                "foulsB": int(f_away),
                "unavailable_players": unavailable_players
            }
        else:
            print(f"   [FotMob] 成功獲取 {home_team} vs {away_team} 賽前最新傷停名單")
            return {
                "possessionA": None,
                "possessionB": None,
                "shotsA": None,
                "shotsB": None,
                "foulsA": None,
                "foulsB": None,
                "unavailable_players": unavailable_players
            }
    except Exception as e:
        print(f"   [FotMob] 爬取統計數據異常: {e}")
        
    return None

def main():
    print(f"正在從 {API_URL} 獲取即時世界盃賽程數據...")
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    max_retries = 3
    json_data = None
    
    for attempt in range(max_retries):
        try:
            # 優先嘗試安全連接，逾時設為 15 秒
            response = requests.get(API_URL, headers=headers, timeout=15)
            if response.status_code == 200:
                json_data = response.json()
                break
            else:
                print(f"   [嘗試 {attempt+1}/{max_retries}] 伺服器回傳狀態碼: {response.status_code}")
        except requests.exceptions.SSLError as ssl_err:
            print(f"   [嘗試 {attempt+1}/{max_retries}] SSL 握手異常: {ssl_err}。嘗試忽略 SSL 憑證驗證...")
            try:
                # SSL Fallback：忽略憑證
                response = requests.get(API_URL, headers=headers, timeout=15, verify=False)
                if response.status_code == 200:
                    json_data = response.json()
                    break
            except Exception as inner_e:
                print(f"      忽略 SSL 連線依然失敗: {inner_e}")
        except Exception as e:
            print(f"   [嘗試 {attempt+1}/{max_retries}] 連線失敗: {e}")
            
        if attempt < max_retries - 1:
            import time
            time.sleep(2)

    if not json_data:
        print("⚠️ 無法連線到即時 API，嘗試使用本地快取 (real_games_results.json) 重新嘗試爬取 FotMob 數據...")
        if os.path.exists(OUTPUT_PATH):
            try:
                with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
                    cached_games = json.load(f)
                
                # 重新掃描已完賽但沒有 stats 或沒有傷停數據的場次跑爬蟲
                updated_any = False
                for g in cached_games:
                    finished = g.get("finished", "FALSE")
                    match_id = g.get("id")
                    need_fetch = False
                    if finished == "TRUE" or finished is True:
                        c_stats = g.get("stats", {})
                        if not c_stats or "possessionA" not in c_stats or c_stats.get("possessionA") is None or "unavailable_players" not in c_stats:
                            need_fetch = True
                            
                    if need_fetch:
                        home_team = g["home_team_name_en"]
                        away_team = g["away_team_name_en"]
                        local_date = g["local_date"]
                        print(f"正在為本地完賽賽事 {home_team} vs {away_team} 重新嘗試爬取 FotMob 真實高階數據與傷停...")
                        stats_data = get_fotmob_stats(home_team, away_team, local_date)
                        if stats_data:
                            g["stats"] = stats_data
                            updated_any = True
                            
                if updated_any:
                    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
                        json.dump(cached_games, f, ensure_ascii=False, indent=2)
                    print(f"✅ 成功更新並保存本地快取的 FotMob 高階數據！")
                else:
                    print("👍 本地所有已完賽對局已有統計數據，無須更新。")
            except Exception as e:
                print(f"❌ 讀取或更新本地快取失敗: {e}")
        else:
            with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False)
        return

    try:
        # 載入本地既有的數據，用於 Skip cached
        existing_stats = {}
        if os.path.exists(OUTPUT_PATH):
            try:
                with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
                    cached_data = json.load(f)
                    for cg in cached_data:
                        if cg.get("id") and cg.get("stats"):
                            existing_stats[cg["id"]] = cg["stats"]
            except Exception as cache_err:
                print(f"⚠️ 讀取現有快取進行對比失敗: {cache_err}")

        # 對齊名稱並簡化數據
        games = json_data.get("games", [])
        aligned_games = []
        
        for g in games:
            home_team = align_name(g.get("home_team_name_en"))
            away_team = align_name(g.get("away_team_name_en"))
            finished = g.get("finished", "FALSE")
            local_date = g.get("local_date")
            
            stats_data = None
            match_id = g.get("id")
            
            # 判斷是否為近期 (前後 3 天內)
            is_recent = False
            try:
                date_part = local_date.split()[0]
                mm, dd, yyyy = date_part.split('/')
                match_dt = datetime(int(yyyy), int(mm), int(dd))
                today_dt = datetime.now()
                days_diff = abs((match_dt - today_dt).days)
                if days_diff <= 3:
                    is_recent = True
            except Exception:
                pass

            if finished == "TRUE" or finished is True:
                has_cached_stats = False
                if match_id in existing_stats:
                    c_stats = existing_stats[match_id]
                    if "possessionA" in c_stats and c_stats.get("possessionA") is not None and "unavailable_players" in c_stats:
                        has_cached_stats = True
                
                if has_cached_stats:
                    print(f"   [FotMob] 賽事 #{match_id} {home_team} vs {away_team} 已有統計數據與傷病名單，跳過爬取。")
                    stats_data = existing_stats[match_id]
                else:
                    print(f"正在為已完賽賽事 {home_team} vs {away_team} 爬取 FotMob 真實高階數據與傷停名單...")
                    stats_data = get_fotmob_stats(home_team, away_team, local_date)
            elif is_recent:
                has_cached_players = False
                if match_id in existing_stats:
                    c_stats = existing_stats[match_id]
                    if "unavailable_players" in c_stats:
                        try:
                            date_part = local_date.split()[0]
                            mm, dd, yyyy = date_part.split('/')
                            match_dt = datetime(int(yyyy), int(mm), int(dd))
                            today_dt = datetime.now()
                            hours_diff = (match_dt - today_dt).total_seconds() / 3600.0
                            if hours_diff > 48:
                                has_cached_players = True
                        except Exception:
                            has_cached_players = True
                            
                if has_cached_players:
                    print(f"   [FotMob] 賽事 #{match_id} {home_team} vs {away_team} 已有賽前傷病快取且大於48小時，跳過爬取。")
                    stats_data = existing_stats[match_id]
                else:
                    print(f"正在為即將開賽賽事 {home_team} vs {away_team} 爬取 FotMob 賽前最新傷停名單...")
                    stats_data = get_fotmob_stats(home_team, away_team, local_date)

            aligned_g = {
                "id": g.get("id"),
                "home_team_name_en": home_team,
                "away_team_name_en": away_team,
                "home_score": g.get("home_score"),
                "away_score": g.get("away_score"),
                "home_scorers": g.get("home_scorers"),
                "away_scorers": g.get("away_scorers"),
                "finished": "TRUE" if finished in ["TRUE", True] else "FALSE",
                "time_elapsed": g.get("time_elapsed", "notstarted"),
                "type": g.get("type", "group"),
                "group": g.get("group"),
                "local_date": local_date,
                "home_team_label": g.get("home_team_label"),
                "away_team_label": g.get("away_team_label")
            }
            
            if stats_data:
                aligned_g["stats"] = stats_data
                
            aligned_games.append(aligned_g)
        
        # 確保儲存目錄存在
        os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
        
        # 寫入 JSON 檔案
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(aligned_games, f, ensure_ascii=False, indent=2)
            
        print(f"✅ 成功同步 {len(aligned_games)} 場比賽數據！")
        print(f"已儲存至: {OUTPUT_PATH}")
            
    except Exception as parse_e:
        print(f"❌ 解析賽事 JSON 失敗: {parse_e}")

if __name__ == "__main__":
    main()
