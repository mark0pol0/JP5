// Simple in-memory store for game sessions
// In production, replace this with a database like Vercel KV, Redis, or PostgreSQL

interface GameSession {
  id: string;
  gameState: any;
  createdAt: number;
  updatedAt: number;
  players: {
    id: string;
    name: string;
    sessionToken?: string;
  }[];
}

// In-memory storage (resets on each deployment)
const gameStore = new Map<string, GameSession>();

// Store cleanup - remove games older than 24 hours
const GAME_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const cleanupOldGames = () => {
  const now = Date.now();
  for (const [id, session] of gameStore.entries()) {
    if (now - session.updatedAt > GAME_EXPIRY_MS) {
      gameStore.delete(id);
    }
  }
};

export const store = {
  getGame: (id: string): GameSession | undefined => {
    cleanupOldGames();
    return gameStore.get(id);
  },

  createGame: (session: GameSession): void => {
    cleanupOldGames();
    gameStore.set(session.id, session);
  },

  updateGame: (id: string, gameState: any): boolean => {
    const session = gameStore.get(id);
    if (!session) return false;

    session.gameState = gameState;
    session.updatedAt = Date.now();
    gameStore.set(id, session);
    return true;
  },

  deleteGame: (id: string): boolean => {
    return gameStore.delete(id);
  },

  getAllGames: (): GameSession[] => {
    cleanupOldGames();
    return Array.from(gameStore.values());
  }
};
