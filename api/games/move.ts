import type { VercelRequest, VercelResponse } from '@vercel/node';
import { store } from '../_store';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gameId, move, sessionToken } = req.body;

    if (!gameId || typeof gameId !== 'string') {
      return res.status(400).json({ error: 'gameId is required' });
    }

    if (!move || typeof move !== 'object') {
      return res.status(400).json({ error: 'move is required' });
    }

    const gameSession = store.getGame(gameId);

    if (!gameSession) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Verify session token
    if (sessionToken) {
      const player = gameSession.players.find(p => p.sessionToken === sessionToken);
      if (!player) {
        return res.status(403).json({ error: 'Invalid session token' });
      }

      // Verify it's the player's turn
      if (move.playerId !== player.id) {
        return res.status(403).json({ error: 'Not your turn' });
      }
    }

    // Add move to game state
    if (!gameSession.gameState.moves) {
      gameSession.gameState.moves = [];
    }

    gameSession.gameState.moves.push(move);
    gameSession.updatedAt = Date.now();

    return res.status(200).json({
      message: 'Move recorded successfully',
      gameState: gameSession.gameState
    });

  } catch (error) {
    console.error('Error recording move:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
