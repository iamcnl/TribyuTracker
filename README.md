# Tribyu Tracker

A dashboard and reward calculator for **Tribyu**, a Bitcoin-reward mining game. It charted the game's prize pool, hashrate and payouts over time and let players estimate their own rewards and profitability.

> **Project status: archived.**
> Tribyu was cancelled in 2025 and data collection has stopped. The site ships with its own frozen snapshot of the data (in `data/`, exported from the original Cloudflare Worker in the [TribyuDatabase](https://github.com/iamcnl/TribyuDatabase) repo), so it works as a static site with no backend. The charts show historical data only. The code is published for reference and is not maintained.

## About Tribyu

Tribyu (formerly Satlantis) was a game that shared its revenue with players as real Bitcoin. Players earned in-game ASICs and Joules, which gave them a hashrate, and every hour a slice of a sats prize pool was paid out in proportion to their share of the total. The team closed it in 2025 after three years, having rewarded 1.41 BTC. This tracker is an unofficial, community-built dashboard and calculator using data collected from 10 February 2025 to 30 September 2025.

## Features

- **Dashboard (`index.html`)**: current prize pool, hashrate, total and last-24h sats paid, latest auction and auction-house activity, plus interactive Plotly graphs for prize pool, hashrate and cumulative rewards with date-range filters and zoom.
- **Detail view (`detail.html`)**: filterable tables of prize pool/hashrate history and payments, an estimate of the next reward based on the final prize pool, and date picking.
- **Reward calculator (`calculator.html`)**: estimates global and personal rewards from hashrate and prize pool, average hashrate over 24h/7d/30d, average Joules price derived from auction data (a default of 325 sats when none exists, as in this archive), and daily profit/loss for a given ASIC count, with formula popups.
- **About (`about.html`)**: a short explanation of what Tribyu was and how its rewards worked, with sources.
- **Preferences**: fiat conversion across 8 currencies (CoinGecko), timezone and 12/24h time, dark mode, all persisted in `localStorage`.

## Tech stack

- Vanilla HTML, CSS and JavaScript (no build step)
- [Plotly.js](https://plotly.com/javascript/) 1.58.5, jQuery 3.6, Moment.js + moment-timezone, Flatpickr (all via CDN)
- Static JSON files in `data/` as the data source (originally served by a Cloudflare Worker + D1, see the `TribyuDatabase` repository)
- CoinGecko public API for BTC prices

## Project structure

```
index.html        dashboard and graphs
detail.html       history and payment tables
calculator.html   reward and profit calculator
about.html        what Tribyu was
script.js         shared data layer (fetching, cleaning, average hashrate)
style.css         styles (light/dark themes)
data/             archived data snapshot (JSON)
img/              icons and logo
```

## Running locally

No install is required. Serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

All data is read from the `data/` folder: `get-channel-data.json`, `get-payment-data.json`, `get-auction-data.json` and `get-ah-history.json`. The auction files are empty in this archive. To use different data, replace these files with exports from the Worker's `/download-*` routes.

Time windows (last 24h, last 7/30/90 days, average hashrate) are measured from the latest data point, so the archived snapshot behaves like a live feed.

## Notes

- Built quickly in 2025 with heavy LLM assistance and cleaned up for archival. Expect duplicated helpers and large inline scripts rather than a polished architecture.