import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../_store';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { gameId, playerName } = req.body;

    if (!gameId || typeof gameId !== 'string') {
      return res.status(400).json({ error: 'gameId is required' });
    }

    if (!playerName || typeof playerName !== 'string') {
      return res.status(400).json({ error: 'playerName is required' });
    }

    const gameSession = store.getGame(gameId);

    if (!gameSession) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Check if game has already started
    if (gameSession.gameState.phase !== 'welcome' && gameSession.gameState.phase !== 'setup') {
      return res.status(400).json({ error: 'Game has already started' });
    }

    // Check if player already exists
    const existingPlayer = gameSession.players.find(p => p.name === playerName);
    if (existingPlayer) {
      return res.status(400).json({ error: 'Player name already taken' });
    }

    // Check if game is full
    const maxPlayers = gameSession.gameState.playerNames?.length || 8;
    if (gameSession.players.length >= maxPlayers) {
      return res.status(400).json({ error: 'Game is full' });
    }

    // Add player to session
    const sessionToken = uuidv4();
    const playerId = `player-${gameSession.players.length + 1}`;

    gameSession.players.push({
      id: playerId,
      name: playerName,
      sessionToken
    });

    gameSession.updatedAt = Date.now();

    return res.status(200).json({
      message: 'Joined game successfully',
      playerId,
      sessionToken,
      gameState: gameSession.gameState
    });

  } catch (error) {
    console.error('Error joining game:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
