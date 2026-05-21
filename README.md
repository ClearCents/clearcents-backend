# ClearCents Backend

Backend API for ClearCents — the subscription waste tracker.
Know what you pay. Own what you use.

## Getting Started

### 1. Install these first
- VS Code — https://code.visualstudio.com
- Node.js — https://nodejs.org
- Git — https://git-scm.com

### 2. Clone the repo
git clone https://github.com/ClearCents/clearcents-backend

### 3. Navigate into the folder on your CMD terminal
cd clearcents-backend

### 4. Install packages on your CMD terminal
npm install

### 5. Create your .env file
Create a file called .env in the project folder and add:

SUPABASE_URL=//credentials

SUPABASE_KEY=//credentials



Contact the repo owner privately for the actual credentials.

### 6. Run the server on your CMD teminal
node server.js

You should see: ClearCents server running on port 3000

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | /subscriptions | Get all subscriptions |
| POST | /subscriptions | Add a new subscription |
| DELETE | /subscriptions/:id | Delete a subscription |

## Tech Stack
- Node.js + Express
- Supabase (PostgreSQL database)
- dotenv

## Team
Private project by ClearCents.
Contact the repo owner for Supabase credentials.
