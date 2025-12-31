// API client for serverless game backend

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export interface CreateGameRequest {
  playerNames: string[];
  playerTeams: Record<string, number>;
  numBoardSections: number;
  playerColors: Record<string, string>;
  hostPlayerName?: string;
}

export interface CreateGameResponse {
  gameId: string;
  sessionToken: string;
  message: string;
  gameState: any;
}

export interface JoinGameRequest {
  gameId: string;
  playerName: string;
}

export interface JoinGameResponse {
  message: string;
  playerId: string;
  sessionToken: string;
  gameState: any;
}

export interface GameStateResponse {
  gameId: string;
  gameState: any;
  players: { id: string; name: string }[];
  createdAt: number;
  updatedAt: number;
}

export interface MoveRequest {
  gameId: string;
  move: any;
  sessionToken?: string;
}

export interface ListGamesResponse {
  games: {
    id: string;
    phase: string;
    playerCount: number;
    maxPlayers: number;
    createdAt: number;
    updatedAt: number;
  }[];
}

class GameApiClient {
  private sessionToken: string | null = null;
  private gameId: string | null = null;

  setSession(gameId: string, sessionToken: string) {
    this.gameId = gameId;
    this.sessionToken = sessionToken;
    // Store in localStorage for persistence
    localStorage.setItem('gameId', gameId);
    localStorage.setItem('sessionToken', sessionToken);
  }

  clearSession() {
    this.gameId = null;
    this.sessionToken = null;
    localStorage.removeItem('gameId');
    localStorage.removeItem('sessionToken');
  }

  restoreSession(): { gameId: string; sessionToken: string } | null {
    const gameId = localStorage.getItem('gameId');
    const sessionToken = localStorage.getItem('sessionToken');

    if (gameId && sessionToken) {
      this.gameId = gameId;
      this.sessionToken = sessionToken;
      return { gameId, sessionToken };
    }

    return null;
  }

  async createGame(request: CreateGameRequest): Promise<CreateGameResponse> {
    const response = await fetch(`${API_BASE_URL}/games/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create game');
    }

    const data = await response.json();
    this.setSession(data.gameId, data.sessionToken);
    return data;
  }

  async joinGame(request: JoinGameRequest): Promise<JoinGameResponse> {
    const response = await fetch(`${API_BASE_URL}/games/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to join game');
    }

    const data = await response.json();
    this.setSession(request.gameId, data.sessionToken);
    return data;
  }

  async getGameState(gameId?: string): Promise<GameStateResponse> {
    const id = gameId || this.gameId;
    if (!id) {
      throw new Error('No game ID provided');
    }

    const response = await fetch(`${API_BASE_URL}/games/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get game state');
    }

    return response.json();
  }

  async updateGameState(gameState: any, gameId?: string): Promise<void> {
    const id = gameId || this.gameId;
    if (!id) {
      throw new Error('No game ID provided');
    }

    const response = await fetch(`${API_BASE_URL}/games/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameState,
        sessionToken: this.sessionToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update game state');
    }
  }

  async submitMove(move: any, gameId?: string): Promise<any> {
    const id = gameId || this.gameId;
    if (!id) {
      throw new Error('No game ID provided');
    }

    const response = await fetch(`${API_BASE_URL}/games/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gameId: id,
        move,
        sessionToken: this.sessionToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to submit move');
    }

    return response.json();
  }

  async listGames(): Promise<ListGamesResponse> {
    const response = await fetch(`${API_BASE_URL}/games/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to list games');
    }

    return response.json();
  }

  // Polling function for real-time updates (simple approach without WebSockets)
  startPolling(callback: (gameState: any) => void, intervalMs: number = 2000): () => void {
    const interval = setInterval(async () => {
      try {
        if (this.gameId) {
          const response = await this.getGameState();
          callback(response.gameState);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, intervalMs);

    // Return cleanup function
    return () => clearInterval(interval);
  }
}

export const gameApi = new GameApiClient();
