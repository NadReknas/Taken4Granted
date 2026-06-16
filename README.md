# Taken4Granted

A grant research and application tool for individuals. Search federal, state, and local grants, filter by eligibility criteria, and track your applications from research to submission.

## Features

- **Grant Search** — Search thousands of federal grants via the Grants.gov API
- **Smart Filters** — Filter by dollar amount, eligibility, funding category, repayment status, and deadline
- **Grant Details** — View full descriptions, eligibility requirements, agency contacts, and attachments
- **Bookmarks** — Save interesting grants for later review
- **Application Tracker** — Pipeline view to track grants from research through submission
- **Eligibility Profile** — Enter your demographics to match with relevant grants
- **Resource Center** — Educational content about grants, scam warnings, glossary, and WA State resources

## Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **APIs**: Grants.gov REST API (no auth required), USAspending.gov
- **Deployment**: Railway

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend dev server proxies `/api` requests to the backend on port 8000.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `sqlite:///./taken4granted.db` |
| `CORS_ORIGINS` | Allowed CORS origins (JSON array) | `["http://localhost:3000"]` |

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI application
│   │   ├── config.py         # Settings
│   │   ├── database.py       # SQLAlchemy setup
│   │   ├── models.py         # Database models
│   │   ├── schemas.py        # Pydantic schemas
│   │   ├── grants_client.py  # Grants.gov API client
│   │   └── routers/
│   │       ├── grants.py     # Grant search/detail endpoints
│   │       └── users.py      # User profile, bookmarks, applications
│   ├── requirements.txt
│   └── Procfile
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/            # Page components
│   │   ├── lib/              # API client, utilities
│   │   └── App.tsx           # Router setup
│   └── package.json
└── README.md
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/grants/search` | Search grants with filters |
| GET | `/api/grants/detail/{id}` | Get full grant details |
| GET | `/api/grants/reference/*` | Reference data for dropdowns |
| POST | `/api/users/profile` | Create/update user profile |
| GET | `/api/users/profile/{email}` | Get user profile |
| POST | `/api/users/profile/{id}/bookmarks` | Add bookmark |
| POST | `/api/users/profile/{id}/applications` | Track application |
| PATCH | `/api/users/applications/{id}` | Update application status |
