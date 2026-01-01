import React, { useState } from 'react';
import './App.css';
import GameController from './components/Game/GameController';
import HomeMenu from './components/HomeMenu/HomeMenu';
import SetupScreen from './components/SetupScreen/SetupScreen';
import MultiplayerLobby from './components/MultiplayerLobby';
import WaitingRoom from './components/WaitingRoom';
import { gameApi } from './services/gameApi';

// Available colors for player selection
const PLAYER_COLORS = [
  { name: 'Red', value: '#FF5733' },
  { name: 'Blue', value: '#33A1FF' },
  { name: 'Green', value: '#33FF57' },
  { name: 'Purple', value: '#F033FF' },
  { name: 'Yellow', value: '#FFFF33' },
  { name: 'Pink', value: '#FF33A8' },
  { name: 'Cyan', value: '#33FFEC' },
  { name: 'Orange', value: '#FF8C33' }
];

type GamePhase = 'home' | 'setup' | 'playing' | 'lobby' | 'waiting';

interface MultiplayerState {
  gameId: string;
  playerName: string;
  isHost: boolean;
  players: { id: string; name: string }[];
}

const App: React.FC = () => {
  const [gamePhase, setGamePhase] = useState<GamePhase>('home');
  const [playerNames, setPlayerNames] = useState<string[]>(['Player 1', 'Player 2']);
  const [playerTeams, setPlayerTeams] = useState<Record<string, number>>({
    'player-1': 0,
    'player-2': 1
  });
  const [playerColors, setPlayerColors] = useState<Record<string, string>>({
    'player-1': PLAYER_COLORS[0].value,
    'player-2': PLAYER_COLORS[1].value
  });
  const [teamMode, setTeamMode] = useState<boolean>(false);
  const [isMultiplayer, setIsMultiplayer] = useState<boolean>(false);
  const [multiplayerState, setMultiplayerState] = useState<MultiplayerState | null>(null);

  const addPlayer = () => {
    if (playerNames.length < 8) {
      const newPlayerIndex = playerNames.length + 1;
      const playerId = `player-${newPlayerIndex}`;
      setPlayerNames([...playerNames, `Player ${newPlayerIndex}`]);
      setPlayerTeams({
        ...playerTeams,
        [playerId]: newPlayerIndex % 2 // Alternate teams
      });
      setPlayerColors({
        ...playerColors,
        [playerId]: PLAYER_COLORS[newPlayerIndex % PLAYER_COLORS.length].value
      });
    }
  };

  const removePlayer = () => {
    if (playerNames.length > 2) {
      const newPlayerNames = [...playerNames];
      newPlayerNames.pop();
      setPlayerNames(newPlayerNames);
      
      const lastPlayerId = `player-${playerNames.length}`;
      const newPlayerTeams = { ...playerTeams };
      const newPlayerColors = { ...playerColors };
      delete newPlayerTeams[lastPlayerId];
      delete newPlayerColors[lastPlayerId];
      
      setPlayerTeams(newPlayerTeams);
      setPlayerColors(newPlayerColors);
    }
  };

  const updatePlayerName = (index: number, name: string) => {
    const newPlayerNames = [...playerNames];
    newPlayerNames[index] = name;
    setPlayerNames(newPlayerNames);
  };

  const updatePlayerTeam = (playerId: string, team: number) => {
    setPlayerTeams({
      ...playerTeams,
      [playerId]: team
    });
  };

  const updatePlayerColor = (playerId: string, color: string) => {
    setPlayerColors({
      ...playerColors,
      [playerId]: color
    });
  };

  const toggleTeamMode = () => {
    setTeamMode(!teamMode);
  };

  // Multiplayer handlers
  const handlePlayOnline = () => {
    setGamePhase('lobby');
  };

  const handleGameCreated = (gameId: string, playerName: string) => {
    setMultiplayerState({
      gameId,
      playerName,
      isHost: true,
      players: [{ id: 'player-1', name: playerName }],
    });
    setIsMultiplayer(true);
    setGamePhase('waiting');
  };

  const handleGameJoined = (gameId: string, playerName: string) => {
    setMultiplayerState({
      gameId,
      playerName,
      isHost: false,
      players: [],
    });
    setIsMultiplayer(true);
    setGamePhase('waiting');
  };

  const handleMultiplayerGameStart = (gameState: any, players: { id: string; name: string }[]) => {
    // Set up the player data for the game
    const names = players.map((p) => p.name);
    const teams: Record<string, number> = {};
    const colors: Record<string, string> = {};

    players.forEach((player, index) => {
      const playerId = `player-${index + 1}`;
      teams[playerId] = index % 2;
      colors[playerId] = PLAYER_COLORS[index % PLAYER_COLORS.length].value;
    });

    setPlayerNames(names);
    setPlayerTeams(teams);
    setPlayerColors(colors);
    setMultiplayerState((prev) => prev ? { ...prev, players } : null);
    setGamePhase('playing');
  };

  const handleLeaveMultiplayer = () => {
    gameApi.clearSession();
    setMultiplayerState(null);
    setIsMultiplayer(false);
    setGamePhase('home');
  };

  const handleBackToHome = () => {
    gameApi.clearSession();
    setMultiplayerState(null);
    setIsMultiplayer(false);
    setGamePhase('home');
  };

  return (
    <div className="App">
      {gamePhase === 'home' && (
        <HomeMenu
          onStartGame={() => setGamePhase('setup')}
          onPlayOnline={handlePlayOnline}
        />
      )}
      {gamePhase === 'setup' && (
        <SetupScreen
          playerNames={playerNames}
          playerTeams={playerTeams}
          playerColors={playerColors}
          teamMode={teamMode}
          onUpdatePlayerName={updatePlayerName}
          onUpdatePlayerTeam={updatePlayerTeam}
          onUpdatePlayerColor={updatePlayerColor}
          onAddPlayer={addPlayer}
          onRemovePlayer={removePlayer}
          onToggleTeamMode={toggleTeamMode}
          onStartGame={() => {
            setIsMultiplayer(false);
            setGamePhase('playing');
          }}
          onBack={() => setGamePhase('home')}
        />
      )}
      {gamePhase === 'lobby' && (
        <MultiplayerLobby
          onBack={handleBackToHome}
          onGameCreated={handleGameCreated}
          onGameJoined={handleGameJoined}
        />
      )}
      {gamePhase === 'waiting' && multiplayerState && (
        <WaitingRoom
          gameId={multiplayerState.gameId}
          playerName={multiplayerState.playerName}
          isHost={multiplayerState.isHost}
          onGameStart={handleMultiplayerGameStart}
          onLeave={handleLeaveMultiplayer}
        />
      )}
      {gamePhase === 'playing' && (
        <GameController
          playerNames={playerNames}
          playerTeams={playerTeams}
          playerColors={playerColors}
          numBoardSections={playerNames.length}
          isMultiplayer={isMultiplayer}
          multiplayerGameId={multiplayerState?.gameId}
          currentPlayerName={multiplayerState?.playerName}
        />
      )}
    </div>
  );
};

export default App;
