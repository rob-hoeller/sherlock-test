# Long-Term Memory: Data Analyst

> This file stores curated insights, lessons learned, and significant events.
> Updated during heartbeats and after important sessions.

---

## User Profile

- **Name:** Rob Hoeller (@rhoeller)
- **Role:** Software Developer at Schell Brothers (home builder in Rehoboth Beach, DE)
- **Key Responsibilities:** Writing SQL queries, managing database, custom reports for executives
- **Preferred Tone:** Sherlock Holmes (Robert Downey Jr. 2009 film style)
- **Communication:** Telegram (paired Feb 6, 2026)

---

## Data Environment

- **Company:** Schell Brothers — production home builder in Sussex County, Delaware
- **Data Format:** CSV files exported from internal database tables (pseudo-database approach)
- **Output Preferences:** Sometimes CSV results, sometimes SQL statements for Rob to run

---

## Key Findings

### Competitive Intelligence (Feb 6, 2026)
- Schell Brothers is #1 production builder in Sussex County by community count (20+)
- Builder of the Year 2023 (Pro Builder Magazine & HBADE)
- Main competitor: Insight Homes (energy efficiency positioning, 15+ communities, lower entry price)
- Ryan Homes has 30 DE communities but quality perception issues
- Sussex County median home price: $472,500 (Oct 2025), down 4.1% YoY
- $1M+ segment growing (54 sales vs 36 YoY)

---

## Query Library

*Reusable queries and methodologies — to be populated as Rob provides CSV data*

---

## Lessons Learned

### Tool Constraints
- **Brave Search API (Free Tier):** Rate limit of 1 request/second, 2000 requests/month
- **Action:** Pace web searches with brief pauses between queries; use web_fetch for direct URL retrieval when possible

---

## Important Decisions

- Stay on Brave Search free tier for now (Feb 6, 2026)
- Icon changed to detective 🕵️‍♂️ per Rob's request

## Geographic Hierarchy (Added 2026-02-09)

**New Tables:**
- **divisions.csv**: 15 divisions (brand-specific divisions like Schell DE, Echelon DE, Kincade DE)
- **division_parents.csv**: 6 regional divisions (Delaware Beach, Richmond VA, Nashville TN, Boise ID, Florida, Delaware North)

**Join Path for Geographic Analysis:**
```
communities → divisions (on division_id) → division_parents (on division_parent_id)
```

**Division Parents (Regional Groupings):**
1. Delaware Beach (DE1) - Rehoboth Beach, DE
2. Richmond (VA1) - North Chesterfield, VA  
3. Delaware North (DE2) - Northern Delaware (inactive)
4. Nashville (TN1) - Hendersonville, TN
6. Boise (ID1) - Eagle, ID
7. Florida (FL1) - Emerald Coast, FL

**Divisions (Brand Divisions):**
- Division 4: Schell Homes - DE1 (Delaware Beach)
- Division 5: Schell Homes - VA1 (Richmond)
- Division 18: Schell Homes - TN1 (Nashville)
- Division 20: Schell Homes - ID1 (Boise)
- Division 22: Schell Homes - FL1 (Florida)
- Plus Echelon and Kincade brands in Delaware

