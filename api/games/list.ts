import type { VercelRequest, VercelResponse } from '@vercel/node';
import { store } from '../_store';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const allGames = store.getAllGames();

    // Return only public game information
    const gameList = allGames.map(session => ({
      id: session.id,
      phase: session.gameState.phase,
      playerCount: session.players.length,
      maxPlayers: session.gameState.playerNames?.length || 8,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }));

    return res.status(200).json({ games: gameList });

  } catch (error) {
    console.error('Error listing games:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
