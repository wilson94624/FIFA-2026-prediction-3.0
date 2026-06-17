import requests
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.fotmob.com/",
    "Accept": "application/json, text/plain, */*",
}

date_str = "20260612"
url = f"https://www.fotmob.com/api/data/matches?date={date_str}"
print(f"Requesting URL: {url}")

try:
    response = requests.get(url, headers=headers, timeout=10)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("\nAll Leagues found on this date:")
        for league in data.get("leagues", []):
            league_name = league.get("name")
            print(f"- {league_name}")
            # 如果包含 world cup，印出裡面的所有 match
            if "world cup" in league_name.lower():
                print("  Matches in World Cup league:")
                for m in league.get("matches", []):
                    home = m.get("home", {}).get("name")
                    away = m.get("away", {}).get("name")
                    match_id = m.get("id")
                    print(f"    * {home} vs {away} (ID: {match_id})")
except Exception as e:
    print(f"Error: {e}")
