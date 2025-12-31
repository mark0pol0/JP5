import type { VercelRequest, VercelResponse } from '@vercel/node';
import { store } from '../_store';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Game ID is required' });
  }

  const gameSession = store.getGame(id);

  if (!gameSession) {
    return res.status(404).json({ error: 'Game not found' });
  }

  // GET - Retrieve game state
  if (req.method === 'GET') {
    return res.status(200).json({
      gameId: gameSession.id,
      gameState: gameSession.gameState,
      players: gameSession.players.map(p => ({ id: p.id, name: p.name })),
      createdAt: gameSession.createdAt,
      updatedAt: gameSession.updatedAt
    });
  }

  // PUT - Update game state
  if (req.method === 'PUT') {
    const { gameState, sessionToken } = req.body;

    if (!gameState) {
      return res.status(400).json({ error: 'gameState is required' });
    }

    // Optional: Verify session token
    if (sessionToken) {
      const hasValidToken = gameSession.players.some(p => p.sessionToken === sessionToken);
      if (!hasValidToken) {
        return res.status(403).json({ error: 'Invalid session token' });
      }
    }

    const updated = store.updateGame(id, gameState);

    if (!updated) {
      return res.status(500).json({ error: 'Failed to update game state' });
    }

    return res.status(200).json({
      message: 'Game state updated successfully',
      gameState
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
