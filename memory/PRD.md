# DriverTax Pro - PRD

## Original Problem Statement
User requested to get the project from GitHub repo https://github.com/PLP-N8n/Driver-Buddy-. The repo returned 404 (possibly private/incorrect URL), but the project files were already present in the workspace.

## Architecture
- **Frontend**: React 19 + TypeScript + Vite (port 3000)
- **Backend**: FastAPI (minimal, port 8001) 
- **Data Storage**: LocalStorage (browser-side)
- **AI Integration**: Google Gemini API (requires GEMINI_API_KEY)
- **Styling**: Tailwind CSS (CDN) + Inter font
- **Charts**: Recharts
- **Icons**: Lucide React

## User Personas
- Self-employed delivery drivers (couriers, food delivery, taxi, logistics)
- UK-based, need HMRC compliance for tax returns

## Core Requirements
- Dashboard with KPI cards and profitability metrics
- Mileage logging with odometer tracking
- Expense logging with receipt AI scanning (Gemini)
- Daily work/performance logging by provider
- HMRC tax logic calculator (Simplified vs Actual Costs methods)
- AI Tax Assistant (Gemini-powered)
- Arcade Mode for quick data entry with gamification (XP/levels)
- Live GPS shift tracker
- CSV export functionality
- Multi-role driver support (Courier, Food Delivery, Taxi, Logistics)
- Financial allocations (tax, maintenance, debt set-aside percentages)

## What's Been Implemented (Jan 2026)
- [x] Restructured project from root `/app/` to Emergent platform structure (`/app/frontend/`, `/app/backend/`)
- [x] Frontend running on Vite with React 19 + TypeScript
- [x] Backend running with FastAPI (health endpoint)
- [x] All 9 components working: Dashboard, MileageLog, ExpenseLog, WorkLog, TaxLogic, TaxAssistant, ArcadeMode, LiveTracker, DatePicker
- [x] All navigation tabs functional
- [x] Export CSV modal functional
- [x] Arcade Mode overlay functional
- [x] Live GPS Tracker overlay functional
- [x] Settings page with role selection, claim method, odometer tracking, financial allocations
- [x] **Feature #1: Backup/Restore** - AES-256-GCM encrypted backup export (.dtpbak), password-protected restore, auto-backup reminder after 10+ entries, stats dashboard (Total Records, Since Backup, Last Backup)
- [x] **Feature #2: Recurring Expenses** - Templates with weekly/monthly/annual frequency, auto-generation of expenses on app load for past-due periods, toggle active/inactive, monthly cost estimate, integrated with backup/restore
- [x] Testing passed (iteration 1: 100%, iteration 2: 95%, iteration 3: 100%)

## Prioritized Backlog
### P0 (Critical)
- None remaining

### P1 (Important)
- Set up Gemini API key for AI Tax Assistant and receipt scanning
- Add data persistence to MongoDB backend (currently localStorage only)

### P2 (Nice to have)
- User authentication
- Mobile-responsive improvements
- Data backup/restore functionality
- Multi-device sync via backend API

## Next Tasks
1. User to provide Gemini API key for AI features
2. Consider migrating localStorage data to MongoDB for persistence
