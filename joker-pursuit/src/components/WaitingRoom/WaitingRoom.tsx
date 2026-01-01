import React, { useEffect, useState, useCallback } from 'react';
import { gameApi, GameStateResponse } from '../../services/gameApi';
import './WaitingRoom.css';

interface WaitingRoomProps {
  gameId: string;
  playerName: string;
  isHost: boolean;
  onGameStart: (gameState: any, players: { id: string; name: string }[]) => void;
  onLeave: () => void;
}

interface FloatingElement {
  id: number;
  type: 'card' | 'peg';
  color: string;
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

const PLAYER_COLORS = [
  { name: 'Red', value: '#FF5733' },
  { name: 'Blue', value: '#33A1FF' },
  { name: 'Green', value: '#33FF57' },
  { name: 'Purple', value: '#F033FF' },
  { name: 'Yellow', value: '#FFFF33' },
  { name: 'Pink', value: '#FF33A8' },
  { name: 'Cyan', value: '#33FFEC' },
  { name: 'Orange', value: '#FF8C33' },
];

const WaitingRoom: React.FC<WaitingRoomProps> = ({
  gameId,
  playerName,
  isHost,
  onGameStart,
  onLeave,
}) => {
  const [floatingElements, setFloatingElements] = useState<FloatingElement[]>([]);
  const [players, setPlayers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [gameState, setGameState] = useState<any>(null);

  // Fetch game state and update player list
  const fetchGameState = useCallback(async () => {
    try {
      const response: GameStateResponse = await gameApi.getGameState(gameId);
      setPlayers(response.players);
      setGameState(response.gameState);

      // Check if the game has started (phase changed to 'playing')
      if (response.gameState?.phase === 'playing') {
        onGameStart(response.gameState, response.players);
      }
    } catch (err) {
      console.error('Failed to fetch game state:', err);
    }
  }, [gameId, onGameStart]);

  useEffect(() => {
    // Create initial floating elements
    const elements: FloatingElement[] = [];
    for (let i = 0; i < 10; i++) {
      elements.push({
        id: i,
        type: 'card',
        color: '#ffffff',
        x: Math.random() * 100,
        y: Math.random() * 100,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5,
      });
    }
    const pegColors = ['#FF5733', '#33A1FF', '#33FF57', '#F033FF', '#FFFF33', '#FF33A8', '#33FFEC', '#FF8C33'];
    for (let i = 0; i < 8; i++) {
      elements.push({
        id: i + 10,
        type: 'peg',
        color: pegColors[i],
        x: Math.random() * 100,
        y: Math.random() * 100,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5,
      });
    }
    setFloatingElements(elements);

    // Initial fetch
    fetchGameState();

    // Start polling for updates
    const stopPolling = gameApi.startPolling((newGameState) => {
      if (newGameState) {
        setGameState(newGameState);
        // Also refresh the full game state to get player list
        fetchGameState();
      }
    }, 2000);

    return () => {
      stopPolling();
    };
  }, [fetchGameState]);

  const copyGameCode = async () => {
    try {
      await navigator.clipboard.writeText(gameId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleStartGame = async () => {
    if (players.length < 2) {
      setError('Need at least 2 players to start');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Create the game state with the current players
      const playerNames = players.map((p) => p.name);
      const playerTeams: Record<string, number> = {};
      const playerColors: Record<string, string> = {};

      players.forEach((player, index) => {
        const playerId = `player-${index + 1}`;
        playerTeams[playerId] = index % 2;
        playerColors[playerId] = PLAYER_COLORS[index % PLAYER_COLORS.length].value;
      });

      // Update game state to 'playing' phase
      const newGameState = {
        ...gameState,
        phase: 'playing',
        playerNames,
        playerTeams,
        playerColors,
        numBoardSections: players.length,
      };

      await gameApi.updateGameState(newGameState, gameId);

      // The polling will detect the phase change and trigger onGameStart
      onGameStart(newGameState, players);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="waiting-room">
      {/* Animated background elements */}
      {floatingElements.map((element) => (
        <div
          key={element.id}
          className={`floating-element ${element.type}`}
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
            backgroundColor: element.type === 'peg' ? element.color : undefined,
          }}
        />
      ))}

      <div className="waiting-content">
        <h1 className="waiting-title">Waiting Room</h1>
        <div className="vintage-line"></div>

        {/* Game Code */}
        <div className="game-code-section">
          <label>Game Code</label>
          <div className="code-display" onClick={copyGameCode}>
            <span className="code-text">{gameId.slice(0, 8).toUpperCase()}</span>
            <button className="copy-button">{copied ? 'Copied!' : 'Copy'}</button>
          </div>
          <p className="code-hint">Share this code with friends to join</p>
        </div>

        {/* Players List */}
        <div className="players-section">
          <h2 className="section-title">
            Players ({players.length}/8)
          </h2>
          <div className="players-list">
            {players.map((player, index) => (
              <div
                key={player.id}
                className={`player-item ${player.name === playerName ? 'is-you' : ''}`}
              >
                <div
                  className="player-color"
                  style={{ backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length].value }}
                />
                <span className="player-name">
                  {player.name}
                  {player.name === playerName && <span className="you-badge">(You)</span>}
                  {index === 0 && <span className="host-badge">Host</span>}
                </span>
              </div>
            ))}

            {/* Empty slots */}
            {Array.from({ length: Math.max(0, 2 - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="player-item empty">
                <div className="player-color empty" />
                <span className="player-name">Waiting for player...</span>
              </div>
            ))}
          </div>
        </div>

        {/* Status/Error Message */}
        {error && <div className="error-message">{error}</div>}

        {!isHost && (
          <div className="waiting-message">
            <div className="spinner"></div>
            <span>Waiting for host to start the game...</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          {isHost && (
            <button
              className="skeuomorphic-button primary-button"
              onClick={handleStartGame}
              disabled={isLoading || players.length < 2}
            >
              <span className="button-text">
                {isLoading ? 'Starting...' : `Start Game (${players.length} players)`}
              </span>
              <div className="button-shine"></div>
            </button>
          )}

          <button className="skeuomorphic-button secondary-button" onClick={onLeave}>
            <span className="button-text">Leave Game</span>
            <div className="button-shine"></div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WaitingRoom;
