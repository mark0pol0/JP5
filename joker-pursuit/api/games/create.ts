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
    const { playerNames, playerTeams, numBoardSections, playerColors, hostPlayerName } = req.body;

    // Validation
    if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 8) {
      return res.status(400).json({ error: 'playerNames must be an array with 2-8 players' });
    }

    if (!playerTeams || typeof playerTeams !== 'object') {
      return res.status(400).json({ error: 'playerTeams is required' });
    }

    if (!numBoardSections || numBoardSections < 2 || numBoardSections > 8) {
      return res.status(400).json({ error: 'numBoardSections must be between 2 and 8' });
    }

    if (!playerColors || typeof playerColors !== 'object') {
      return res.status(400).json({ error: 'playerColors is required' });
    }

    // Create game session
    const gameId = uuidv4();
    const sessionToken = uuidv4();

    // Create initial game session
    const gameSession = {
      id: gameId,
      gameState: {
        id: gameId,
        phase: 'welcome',
        playerNames,
        playerTeams,
        numBoardSections,
        playerColors,
        initialized: false
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players: [{
        id: 'player-1',
        name: hostPlayerName || playerNames[0],
        sessionToken
      }]
    };

    store.createGame(gameSession);

    return res.status(201).json({
      gameId,
      sessionToken,
      message: 'Game created successfully',
      gameState: gameSession.gameState
    });

  } catch (error) {
    console.error('Error creating game:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
