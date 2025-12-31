# JP5 - Joker Pursuit Game

A multiplayer digital board game with serverless backend infrastructure.

## Project Structure

```
JP5/
├── joker-pursuit/          # Main React application
│   ├── src/                # React components and game logic
│   ├── api/                # Vercel serverless functions
│   ├── public/             # Static assets
│   └── build/              # Production build output
├── vercel.json             # Vercel deployment configuration
└── package.json            # Root package configuration
```

## Quick Start

### Local Development

```bash
# Install dependencies
cd joker-pursuit
npm install

# Start development server
npm start
```

The app will run at `http://localhost:3000`

### Deploy to Vercel

#### Option 1: Vercel CLI

```bash
# Install Vercel CLI globally
npm install -g vercel

# Deploy from root directory
cd /home/user/JP5
vercel

# Follow the prompts
```

#### Option 2: Vercel Dashboard

1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Vercel will auto-detect the configuration
4. Click "Deploy"

## Environment Variables

No environment variables are required for basic deployment. The app uses relative API paths (`/api`) that work automatically on Vercel.

For custom API URLs, set in Vercel Dashboard:
- `REACT_APP_API_URL` - Custom API endpoint (optional)

## Documentation

- **Game Documentation**: See `joker-pursuit/README.md`
- **Serverless Setup**: See `joker-pursuit/SERVERLESS_SETUP.md`

## Architecture

- **Frontend**: React 19.0.0 (Single Page Application)
- **Backend**: Vercel Serverless Functions (Node.js)
- **Storage**: In-memory (upgradeable to Vercel KV/PostgreSQL)
- **Real-time**: Polling (upgradeable to WebSockets)

## API Endpoints

- `POST /api/games/create` - Create new game
- `POST /api/games/join` - Join game
- `GET /api/games/:id` - Get game state
- `PUT /api/games/:id` - Update game state
- `POST /api/games/move` - Submit move
- `GET /api/games/list` - List games

## Troubleshooting

**404 Error on Vercel?**
- Ensure you're deploying from the repository root (`/home/user/JP5`)
- Verify `vercel.json` exists in the root directory
- Check Vercel build logs for errors

**Build Fails?**
- Run `cd joker-pursuit && npm install && npm run build` locally
- Check for TypeScript errors
- Ensure all dependencies are installed

**API Not Working?**
- Check Vercel Functions logs in dashboard
- Verify CORS headers are enabled
- Test API endpoints: `/api/games/list`

## License

Private project
