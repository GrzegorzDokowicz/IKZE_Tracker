#!/usr/bin/env python3
"""Pobiera ceny zamknięcia (Yahoo Finance przez yfinance) i kursy NBP (tabela A). Uruchamiane codziennie przez GitHub Actions."""
import json, sys, pathlib, datetime as dt, urllib.request
import yfinance as yf

ROOT = pathlib.Path(__file__).resolve().parent.parent
cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
pf, hf = ROOT / "data/prices.json", ROOT / "data/history.json"
prices = json.loads(pf.read_text(encoding="utf-8"))
hist = json.loads(hf.read_text(encoding="utf-8"))
today = dt.datetime.now(dt.timezone.utc)
ok = fail = 0

def nbp(code):
    url = f"https://api.nbp.pl/api/exchangerates/rates/a/{code.lower()}/last/2/?format=json"
    with urllib.request.urlopen(url, timeout=30) as r:
        rates = json.load(r)["rates"]
    return rates[-1]["mid"], rates[-2]["mid"]

for ccy in sorted({i["ccy"] for i in cfg["instruments"]} - {"PLN"}):
    try:
        r, p = nbp(ccy); prices["fx"][ccy] = {"r": r, "prev": p}; ok += 1
    except Exception as e:
        print(f"FX {ccy}: {e}", file=sys.stderr); fail += 1

for i in cfg["instruments"]:
    try:
        t = yf.Ticker(i["yahoo"])
        cur = (t.fast_info.get("currency") or "").strip()
        scale = 0.01 if cur == "GBp" else 1.0
        cur = "GBP" if cur == "GBp" else cur
        if cur and cur != i["ccy"]:
            raise ValueError(f"waluta notowania {cur} != {i['ccy']} w config.json")
        h = t.history(period="10d", auto_adjust=False)["Close"].dropna()
        if len(h) < 2: raise ValueError("za mało danych")
        prices["px"][i["ticker"]] = {"p": round(float(h.iloc[-1]) * scale, 4), "prev": round(float(h.iloc[-2]) * scale, 4)}
        ok += 1
    except Exception as e:
        print(f"{i['ticker']}: {e}", file=sys.stderr); fail += 1

if ok == 0:
    sys.exit("Brak jakichkolwiek nowych danych")
prices["date"] = today.strftime("%Y-%m-%d")
prices["updated"] = today.strftime("%Y-%m-%dT%H:%M:%SZ")
day = {k: v["p"] for k, v in prices["px"].items()}
day.update({k: v["r"] for k, v in prices["fx"].items()})
hist["days"][prices["date"]] = day
pf.write_text(json.dumps(prices, ensure_ascii=False, indent=1), encoding="utf-8")
hf.write_text(json.dumps(hist, ensure_ascii=False), encoding="utf-8")
print(f"OK={ok} błędy={fail}")
