import React, { useEffect, useState } from 'react';
import { gameApi, ListGamesResponse } from '../../services/gameApi';
import './MultiplayerLobby.css';

interface MultiplayerLobbyProps {
  onBack: () => void;
  onGameCreated: (gameId: string, playerName: string) => void;
  onGameJoined: (gameId: string, playerName: string) => void;
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

const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
  onBack,
  onGameCreated,
  onGameJoined,
}) => {
  const [floatingElements, setFloatingElements] = useState<FloatingElement[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [gameCode, setGameCode] = useState('');
  const [availableGames, setAvailableGames] = useState<ListGamesResponse['games']>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'join' | 'browse'>('create');

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
  }, []);

  useEffect(() => {
    if (activeTab === 'browse') {
      fetchAvailableGames();
    }
  }, [activeTab]);

  const fetchAvailableGames = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await gameApi.listGames();
      // Filter to only show games in waiting phase
      const waitingGames = response.games.filter(
        (game) => game.phase === 'welcome' || game.phase === 'setup'
      );
      setAvailableGames(waitingGames);
    } catch (err) {
      setError('Failed to fetch available games');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await gameApi.createGame({
        playerNames: [playerName.trim()],
        playerTeams: { 'player-1': 0 },
        playerColors: { 'player-1': '#FF5733' },
        numBoardSections: 2,
        hostPlayerName: playerName.trim(),
      });

      onGameCreated(response.gameId, playerName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinByCode = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!gameCode.trim()) {
      setError('Please enter a game code');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await gameApi.joinGame({
        gameId: gameCode.trim(),
        playerName: playerName.trim(),
      });

      onGameJoined(gameCode.trim(), playerName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinGame = async (gameId: string) => {
    if (!playerName.trim()) {
      setError('Please enter your name first');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await gameApi.joinGame({
        gameId,
        playerName: playerName.trim(),
      });

      onGameJoined(gameId, playerName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="multiplayer-lobby">
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

      <div className="lobby-content">
        <h1 className="lobby-title">Play Online</h1>
        <div className="vintage-line"></div>

        {/* Player Name Input */}
        <div className="player-name-section">
          <label htmlFor="player-name">Your Name</label>
          <input
            id="player-name"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name..."
            maxLength={20}
            className="name-input"
          />
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => setActiveTab('create')}
          >
            Create Game
          </button>
          <button
            className={`tab-button ${activeTab === 'join' ? 'active' : ''}`}
            onClick={() => setActiveTab('join')}
          >
            Join by Code
          </button>
          <button
            className={`tab-button ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => setActiveTab('browse')}
          >
            Browse Games
          </button>
        </div>

        {/* Error Message */}
        {error && <div className="error-message">{error}</div>}

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'create' && (
            <div className="create-section">
              <p className="section-description">
                Create a new game and invite friends to join using your game code.
              </p>
              <button
                className="skeuomorphic-button primary-button"
                onClick={handleCreateGame}
                disabled={isLoading}
              >
                <span className="button-text">
                  {isLoading ? 'Creating...' : 'Create New Game'}
                </span>
                <div className="button-shine"></div>
              </button>
            </div>
          )}

          {activeTab === 'join' && (
            <div className="join-section">
              <p className="section-description">
                Enter the game code shared by your friend to join their game.
              </p>
              <input
                type="text"
                value={gameCode}
                onChange={(e) => setGameCode(e.target.value)}
                placeholder="Enter game code..."
                className="code-input"
              />
              <button
                className="skeuomorphic-button primary-button"
                onClick={handleJoinByCode}
                disabled={isLoading}
              >
                <span className="button-text">
                  {isLoading ? 'Joining...' : 'Join Game'}
                </span>
                <div className="button-shine"></div>
              </button>
            </div>
          )}

          {activeTab === 'browse' && (
            <div className="browse-section">
              <div className="browse-header">
                <p className="section-description">
                  Find and join an open game.
                </p>
                <button
                  className="refresh-button"
                  onClick={fetchAvailableGames}
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              <div className="games-list">
                {availableGames.length === 0 ? (
                  <div className="no-games">
                    {isLoading ? 'Loading games...' : 'No games available. Create one!'}
                  </div>
                ) : (
                  availableGames.map((game) => (
                    <div key={game.id} className="game-card">
                      <div className="game-info">
                        <span className="game-id">Game #{game.id.slice(0, 8)}</span>
                        <span className="game-players">
                          {game.playerCount}/{game.maxPlayers} players
                        </span>
                        <span className="game-time">{formatTimeAgo(game.createdAt)}</span>
                      </div>
                      <button
                        className="join-game-button"
                        onClick={() => handleJoinGame(game.id)}
                        disabled={isLoading || game.playerCount >= game.maxPlayers}
                      >
                        {game.playerCount >= game.maxPlayers ? 'Full' : 'Join'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Back Button */}
        <button className="skeuomorphic-button secondary-button back-button" onClick={onBack}>
          <span className="button-text">Back to Menu</span>
          <div className="button-shine"></div>
        </button>
      </div>
    </div>
  );
};

export default MultiplayerLobby;
