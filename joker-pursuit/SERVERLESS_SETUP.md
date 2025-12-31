# Joker Pursuit - Serverless Setup Guide

This guide explains the serverless architecture for Joker Pursuit, enabling multiplayer gameplay and persistent game sessions.

## Architecture Overview

The application now uses a **serverless backend** powered by Vercel Functions:

- **Frontend**: React SPA (Single Page Application)
- **Backend**: Serverless API functions in `/api` directory
- **Storage**: In-memory store (can be upgraded to database)
- **Deployment**: Vercel (optimized for React + serverless)

## Project Structure

```
joker-pursuit/
├── api/                          # Serverless functions
│   ├── _store.ts                 # In-memory game storage
│   └── games/
│       ├── create.ts             # POST /api/games/create
│       ├── [id].ts               # GET/PUT /api/games/:id
│       ├── join.ts               # POST /api/games/join
│       ├── move.ts               # POST /api/games/move
│       └── list.ts               # GET /api/games/list
├── src/
│   ├── services/
│   │   └── gameApi.ts            # Frontend API client
│   └── ...                       # React components
├── vercel.json                   # Vercel configuration
├── .env.local                    # Local environment
└── .env.production               # Production environment
```

## API Endpoints

### 1. Create Game
**POST** `/api/games/create`

Request:
```json
{
  "playerNames": ["Player 1", "Player 2"],
  "playerTeams": { "player-1": 0, "player-2": 1 },
  "numBoardSections": 2,
  "playerColors": { "player-1": "#FF0000", "player-2": "#0000FF" },
  "hostPlayerName": "Player 1"
}
```

Response:
```json
{
  "gameId": "uuid-here",
  "sessionToken": "token-here",
  "message": "Game created successfully",
  "gameState": { ... }
}
```

### 2. Join Game
**POST** `/api/games/join`

Request:
```json
{
  "gameId": "uuid-here",
  "playerName": "Player 2"
}
```

Response:
```json
{
  "message": "Joined game successfully",
  "playerId": "player-2",
  "sessionToken": "token-here",
  "gameState": { ... }
}
```

### 3. Get Game State
**GET** `/api/games/:id`

Response:
```json
{
  "gameId": "uuid-here",
  "gameState": { ... },
  "players": [
    { "id": "player-1", "name": "Player 1" },
    { "id": "player-2", "name": "Player 2" }
  ],
  "createdAt": 1234567890,
  "updatedAt": 1234567890
}
```

### 4. Update Game State
**PUT** `/api/games/:id`

Request:
```json
{
  "gameState": { ... },
  "sessionToken": "token-here"
}
```

### 5. Submit Move
**POST** `/api/games/move`

Request:
```json
{
  "gameId": "uuid-here",
  "move": {
    "playerId": "player-1",
    "cardId": "card-1",
    "pegId": "player-1-peg-1",
    "from": "space-1",
    "destinations": ["space-2"]
  },
  "sessionToken": "token-here"
}
```

### 6. List Games
**GET** `/api/games/list`

Response:
```json
{
  "games": [
    {
      "id": "uuid-here",
      "phase": "playing",
      "playerCount": 2,
      "maxPlayers": 4,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

## Frontend Usage

The `gameApi` client handles all API communication:

```typescript
import { gameApi } from './services/gameApi';

// Create a new game
const response = await gameApi.createGame({
  playerNames: ['Alice', 'Bob'],
  playerTeams: { 'player-1': 0, 'player-2': 1 },
  numBoardSections: 2,
  playerColors: { 'player-1': '#FF0000', 'player-2': '#0000FF' }
});

// Join existing game
await gameApi.joinGame({
  gameId: 'game-id-here',
  playerName: 'Charlie'
});

// Get game state
const gameState = await gameApi.getGameState();

// Update game state
await gameApi.updateGameState(newGameState);

// Submit a move
await gameApi.submitMove(move);

// Start polling for updates (simple real-time sync)
const stopPolling = gameApi.startPolling((gameState) => {
  console.log('Game state updated:', gameState);
}, 2000);

// Stop polling when done
stopPolling();
```

## Deployment

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

The React app runs on `http://localhost:3000` and API calls are made to `/api/*`.

### Deploy to Vercel

1. Install Vercel CLI (if not already installed):
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd joker-pursuit
vercel
```

3. Follow the prompts to link your project

4. Your app will be live at `https://your-project.vercel.app`

## Environment Variables

- **Local**: `.env.local`
  - `REACT_APP_API_URL=http://localhost:3000/api`

- **Production**: `.env.production`
  - `REACT_APP_API_URL=/api`

## Storage

Currently using **in-memory storage** (resets on each deployment). For production, consider upgrading to:

- **Vercel KV** (Redis-compatible)
- **Vercel Postgres**
- **Supabase** (PostgreSQL + real-time)
- **Firebase Realtime Database**

## Real-Time Sync

Currently using **polling** (checks for updates every 2 seconds). For better real-time experience, consider:

- **WebSockets** via Vercel Edge Functions
- **Server-Sent Events (SSE)**
- **Pusher** or **Ably** (hosted real-time services)

## Security

- Session tokens authenticate players
- CORS headers allow cross-origin requests
- Token validation prevents unauthorized moves
- Games auto-expire after 24 hours

## Limitations

- **In-memory storage**: Games are lost on redeployment
- **Polling**: 2-second delay for updates (not true real-time)
- **No persistence**: No game history or replay functionality
- **No authentication**: Session tokens are the only security

## Next Steps

To enhance the serverless setup:

1. Add a database for persistent storage
2. Implement WebSockets for real-time multiplayer
3. Add user authentication (Auth0, Firebase Auth)
4. Implement game history and replay
5. Add AI opponents
6. Create leaderboards

## Troubleshooting

**API calls failing locally?**
- Ensure `npm start` is running
- Check `.env.local` has correct API URL
- Verify CORS headers in API functions

**Game state not syncing?**
- Check browser console for errors
- Verify session token is stored in localStorage
- Ensure polling is started with `gameApi.startPolling()`

**Deployment issues?**
- Run `vercel --prod` for production deployment
- Check Vercel logs: `vercel logs`
- Verify `vercel.json` configuration

## Support

For issues or questions, refer to:
- [Vercel Documentation](https://vercel.com/docs)
- [React Documentation](https://react.dev)
- Game logic in `/src/models/` and `/src/utils/`
