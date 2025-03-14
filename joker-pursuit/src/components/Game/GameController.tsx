import React, { useState, useEffect, useRef } from 'react';
import { GameState, createInitialGameState, advanceToNextPlayer, isGameOver, shuffleAndDealCards, GamePhase, Move } from '../../models/GameState';
import { getPossibleMoves, applyMove, findSpaceForPeg } from '../../utils/MovementUtils';
import { BoardSpace } from '../../models/BoardModel';
import { Card } from '../../models/Card';
import Board from '../Board/Board';
import PlayerPanel from '../PlayerPanel/PlayerPanel';
import CardHand from '../CardHand/CardHand';
import './GameController.css';
import { Player } from '../../models/Player';

interface GameControllerProps {
  playerNames: string[];
  playerTeams: Record<string, number>;
  numBoardSections: number;
  playerColors: Record<string, string>;
}

// Add new interface for nine card state
interface NineCardState {
  direction?: 'forward' | 'backward';  // Explicitly typed as union
  steps?: number;
  state: 'INITIAL' | 'DIRECTION_SELECTED' | 'STEPS_CHOSEN' | 'FIRST_MOVE_COMPLETE' | 'SECOND_MOVE_READY' | 'NO_VALID_SECOND_MOVES';
  firstMoveComplete: boolean;
  firstMovePegId?: string;
  remainingSteps?: number;
  // Track selectable pegs for second move
  selectablePegsForSecondMove?: string[];
  // Add flag to track if split was selected
  splitSelected?: boolean;
}

// Add new interface for seven card state
interface SevenCardState {
  // The current state in the 7 card split process
  state: 'INITIAL' | 'SPLIT_SELECTED' | 'STEPS_CHOSEN' | 'FIRST_MOVE_COMPLETE' | 'SECOND_MOVE_READY';
  isSplit: boolean;
  firstMovePegId?: string;
  firstMoveSteps?: number;
  remainingSteps?: number;
  // Track which spaces were selectable for the first move
  firstMoveSelectableSpaces?: string[];
  // Track destination space for first move
  firstMoveDestination?: string;
  // Track selectable pegs for second move
  selectablePegsForSecondMove?: string[];
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

const hasFaceCards = (hand: Card[]): boolean => {
  return hand.some(card => card.isFace || card.rank === 'joker' || card.rank === 'ace');
};

// Determine if a player can use the discard hand button based on new rules
const canUseDiscardButton = (gameState: GameState, player: Player): boolean => {
  // Check if player has face cards, ace cards, or jokers
  const hasFaceOrAceCard = player.hand.some((card: Card) => card.isFace || card.rank === 'ace');
  
  // Check if player has a joker
  const hasJoker = player.hand.some((card: Card) => card.rank === 'joker');
  
  // Check where all the player's pegs are located
  const pegPositions = player.pegs.map((pegId: string) => {
    const pegSpace = findSpaceForPeg(gameState, pegId);
    return pegSpace ? pegSpace.type : 'unknown';
  });
  
  // If any peg is moving around on the board (not in home or castle), player should not be able to discard
  const hasPegOnBoard = pegPositions.some((type: string) => type !== 'home' && type !== 'castle' && type !== 'unknown');
  if (hasPegOnBoard) {
    return false;
  }
  
  // If player has face card or ace, they don't need to discard
  if (hasFaceOrAceCard) {
    return false;
  }
  
  // If player has a joker, check if it's usable (there's an opponent's peg that can be hit)
  if (hasJoker) {
    // Check if there are any opponent pegs on the board that could be hit with a joker
    let canUseJoker = false;
    
    // Look through all spaces for opponent pegs that can be hit
    gameState.board.allSpaces.forEach((space) => {
      // Only check normal and entrance spaces (places where jokers can hit)
      if (space.type !== 'normal' && space.type !== 'entrance') {
        return;
      }
      
      // Check for opponent pegs in this space
      space.pegs.forEach(pegId => {
        const [pegPlayerId] = pegId.split('-peg-');
        // If this is an opponent's peg, the joker is usable
        if (pegPlayerId !== player.id) {
          canUseJoker = true;
        }
      });
    });
    
    // If joker is usable, player doesn't need to discard
    if (canUseJoker) {
      return false;
    }
  }
  
  // All pegs are in home, or in a combination of home and castle
  // Player has no face cards, aces, or usable jokers
  // Therefore, player should be able to discard hand
  return true;
};

const Log = (message: string, ...args: any[]) => {
  console.log(`[GameController] ${message}`, ...args);
};

const GameController: React.FC<GameControllerProps> = ({ 
  playerNames, 
  playerTeams,
  numBoardSections,
  playerColors 
}) => {
  // Initialize game state
  const [gameState, setGameState] = useState<GameState>(() => {
    const initialState = createInitialGameState(playerNames, playerTeams, numBoardSections, playerColors);
    return initialState;
  });
  
  // Dev mode state
  const [devMode, setDevMode] = useState(false);
  const [movePegsMode, setMovePegsMode] = useState(false);
  const [preservePlayMode, setPreservePlayMode] = useState(false);
  
  // Calculate initial zoom level based on viewport size
  const calculateInitialZoom = () => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const boardSize = 1400; // This is our board's base size
    
    // Calculate zoom ratios for both dimensions
    const widthRatio = (viewportWidth * 0.9) / boardSize;
    const heightRatio = (viewportHeight * 0.8) / boardSize;
    
    // Use the smaller ratio to ensure board fits in both dimensions
    const initialZoom = Math.min(widthRatio, heightRatio);
    
    // Clamp the zoom between our min and max values
    return Math.min(Math.max(initialZoom, 0.5), 2);
  };
  
  // Initialize zoom level with calculated value
  const [zoomLevel, setZoomLevel] = useState(calculateInitialZoom());

  // Add window resize handler
  useEffect(() => {
    const handleResize = () => {
      setZoomLevel(calculateInitialZoom());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // UI state
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedPegId, setSelectedPegId] = useState<string | null>(null);
  const [selectableSpaceIds, setSelectableSpaceIds] = useState<string[]>([]);
  const [selectablePegIds, setSelectablePegIds] = useState<string[]>([]);
  const [promptMessage, setPromptMessage] = useState<string>('');
  
  // Add new state for nine card handling
  const [nineCardState, setNineCardState] = useState<NineCardState>({
    state: 'INITIAL',
    firstMoveComplete: false
  });
  
  // Add new state for seven card handling
  const [sevenCardState, setSevenCardState] = useState<SevenCardState>({
    state: 'INITIAL',
    isSplit: false
  });
  
  // Add state for bump message
  const [bumpMessage, setBumpMessage] = useState<string | undefined>();
  
  // Get current player
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  
  // Add new state for floating elements
  const [floatingElements, setFloatingElements] = useState<FloatingElement[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);
  
  // Add new state to track when first move is complete
  const [firstMoveCompleted, setFirstMoveCompleted] = useState<boolean>(false);
  
  // Add state for debug logging
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  
  // Add these to the existing state variables
  const [castlePromptState, setCastlePromptState] = useState<{
    isActive: boolean;
    pegId: string;
    regularMove?: Move;
    castleMove?: Move;
  }>({
    isActive: false,
    pegId: ''
  });
  
  // Add logging function
  const logDebug = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(`[DEBUG] ${logMessage}`);
    setDebugLogs(prev => [...prev, logMessage]);
  };
  
  useEffect(() => {
    // Create initial floating elements
    const elements: FloatingElement[] = [];
    // Add 10 cards
    for (let i = 0; i < 10; i++) {
      elements.push({
        id: i,
        type: 'card',
        color: '#ffffff',
        x: Math.random() * 100,
        y: Math.random() * 100,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5
      });
    }
    // Add 8 pegs with different colors
    const pegColors = ['#FF5733', '#33A1FF', '#33FF57', '#F033FF', '#FFFF33', '#FF33A8', '#33FFEC', '#FF8C33'];
    for (let i = 0; i < 8; i++) {
      elements.push({
        id: i + 10,
        type: 'peg',
        color: pegColors[i],
        x: Math.random() * 100,
        y: Math.random() * 100,
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5
      });
    }
    setFloatingElements(elements);
    
    // Log that the game has loaded
    logDebug("Game component loaded");
  }, []);
  
  // Add an effect to log current game state when it changes
  useEffect(() => {
    // Log current player info when game state changes
    if (gameState.phase === 'playing') {
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      logDebug(`Current player: ${currentPlayer.name} (${currentPlayer.id})`);
      logDebug(`Hand: ${currentPlayer.hand.map(c => `${c.rank} of ${c.suit}`).join(', ')}`);
    }
  }, [gameState.currentPlayerIndex, gameState.phase]);
  
  // Calculate selectable spaces when a card is selected
  const calculateSelectableSpaces = (cardId: string) => {
    const selectedCard = currentPlayer?.hand.find(c => c.id === cardId);
    
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer?.id, 
      cardId,
      selectedCard?.rank === '9' ? {
        direction: nineCardState.direction,
        steps: nineCardState.steps,
        isSecondMove: nineCardState.firstMoveComplete,
        firstMovePegId: nineCardState.firstMovePegId
      } : selectedCard?.rank === '7' && sevenCardState.isSplit ? {
        steps: sevenCardState.firstMoveSteps,
        isSecondMove: sevenCardState.firstMoveSteps !== undefined,
        firstMovePegId: sevenCardState.firstMovePegId
      } : undefined
    );
    const spaceIds = new Set<string>();
    const pegIds = new Set<string>();
    
    moves.forEach(move => {
      // For the second part of a 7 card split, we need to track selectable pegs
      if (selectedCard?.rank === '7' && sevenCardState.isSplit && sevenCardState.firstMoveSteps !== undefined) {
        pegIds.add(move.pegId);
      }
      move.destinations.forEach(dest => spaceIds.add(dest));
    });
    
    // Update selectable peg IDs if needed
    if (pegIds.size > 0) {
      setSelectablePegIds(Array.from(pegIds));
    }
    
    return Array.from(spaceIds);
  };
  
  // Handle shuffling and dealing cards
  const handleShuffleAndDeal = () => {
    setIsShuffling(true);
    
    // Wait for animation to complete before actually shuffling
    setTimeout(() => {
      // Use the existing shuffleAndDealCards function
      const newState = shuffleAndDealCards(gameState);
      setGameState(newState);
      setIsShuffling(false);
    }, 3000); // 3 seconds for the animation
  };
  
  // Handle card selection
  const handleCardSelect = (cardId: string) => {
    // If a card is already selected, reset everything
    if (selectedCardId) {
      setPromptMessage('');
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setNineCardState({ state: 'INITIAL', firstMoveComplete: false, splitSelected: false });
      setSevenCardState({ state: 'INITIAL', isSplit: false });
      return;
    }
    
    // First check for special cards with additional options
    const selectedCard = gameState?.players[gameState?.currentPlayerIndex]?.hand.find(card => card.id === cardId);
    if (selectedCard) {
      logDebug(`Selected card: ${selectedCard.rank} of ${selectedCard.suit}`);
      
      // Set card as selected
      setSelectedCardId(cardId);
      
      // Specific prompt for joker card
      if (selectedCard.rank === 'joker') {
        logDebug("Joker card selected - prompting user to select their own peg first");
        setPromptMessage("Click on one of your pegs to select which one to teleport");
      } 
      // Special handling for 7 card
      else if (selectedCard.rank === '7') {
        logDebug("7 card selected - offering move or split options");
        setPromptMessage('Choose an option: "Move 7" or "Split 7"');
      }
      // Special handling for 9 card
      else if (selectedCard.rank === '9') {
        logDebug("9 card selected - offering regular or split options");
        setPromptMessage('Choose an Option:');
      } 
      else {
        // Regular card handling
        setPromptMessage("Click on one of your pegs to apply this card's move");
      }
      
      setSelectedPegId(null);
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setNineCardState({ state: 'INITIAL', firstMoveComplete: false, splitSelected: false });
      setSevenCardState({ state: 'INITIAL', isSplit: false });
    }
  };
  
  // Handle nine card option selection (regular move or split)
  const handleNineCardOption = (option: 'move' | 'split') => {
    Log(`9 card option selected: ${option}`);
    
    // Regular forward 9 spaces move
    if (option === 'move') {
      // For regular move, we don't need the direction selection or steps selection
      // Set a special state that indicates this is a regular move, not a split
      setNineCardState(prev => ({
        ...prev,
        state: 'STEPS_CHOSEN', // Skip to this state directly
        direction: 'forward',
        firstMoveComplete: false,
        steps: 9, // Set steps directly to 9
        splitSelected: false // Explicitly set this to false
      }));
      
      // Skip the direction and steps selection entirely and go straight to peg selection
      if (selectedCardId) {
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        const moves = getPossibleMoves(gameState, currentPlayer?.id, selectedCardId, {
          direction: 'forward', 
          steps: 9
        });
        
        // Get unique peg IDs from all possible moves
        const pegIds = new Set<string>();
        moves.forEach(move => pegIds.add(move.pegId));
        
        setSelectablePegIds(Array.from(pegIds));
        setPromptMessage(`Choose a peg to move 9 spaces forward`);
      }
    } 
    // Split move (part forward, part backward)
    else if (option === 'split') {
      // For split, show direction buttons
      setNineCardState(prev => ({
        ...prev,
        state: 'INITIAL',
        firstMoveComplete: false,
        direction: undefined, // Explicitly reset direction to force direction selection
        splitSelected: true // Set this to true to track that split was selected
      }));
      
      setPromptMessage('Choose the direction for the first part of the split: "Forward" or "Backward"');
    }
  };
  
  // Handle nine card direction selection
  const handleNineCardDirection = (direction: 'forward' | 'backward') => {
    Log(`Nine card direction selected: ${direction}`);
    setNineCardState(prev => ({ 
      ...prev, 
      state: 'DIRECTION_SELECTED',
      direction 
    }));
    setPromptMessage(`How many spaces ${direction} would you like to move? (1-8)`);
  };
  
  // Handle nine card steps selection
  const handleNineCardSteps = (steps: number) => {
    if (steps < 1 || steps > 8) {
      setPromptMessage("Please select a number between 1 and 8");
      return;
    }
    
    setNineCardState(prev => ({ 
      ...prev, 
      state: 'STEPS_CHOSEN',
      steps 
    }));
    
    setPromptMessage("Click on a peg to move");
    
    // Calculate selectable spaces for the first move
    if (selectedCardId) {
      setTimeout(() => {
        const spaces = calculateSelectableSpaces(selectedCardId);
        setSelectableSpaceIds(spaces);
      }, 0);
    }
  };
  
  // Handle seven card option selection (move 1 peg or split between 2 pegs)
  const handleSevenCardOption = (option: 'move' | 'split') => {
    // Move 7 spaces (straightforward)
    if (option === 'move') {
      if (selectedCardId) {
        // For regular 7 card move, just show the selectable pegs
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        const moves = getPossibleMoves(gameState, currentPlayer?.id, selectedCardId);
        
        // Get unique peg IDs from all possible moves
        const pegIds = new Set<string>();
        moves.forEach(move => pegIds.add(move.pegId));
        
        setSelectablePegIds(Array.from(pegIds));
        setPromptMessage(`Choose a peg to move 7 spaces`);
        setSevenCardState(prev => ({ ...prev, state: 'INITIAL', isSplit: false }));
      }
    }
    // Split the 7 into two moves
    else if (option === 'split') {
      setPromptMessage(`Choose how many spaces to move the first peg (1-6)`);
      setSevenCardState(prev => ({ ...prev, state: 'SPLIT_SELECTED', isSplit: true }));
    }
  };
  
  // Handle seven card steps selection for the first peg
  const handleSevenCardSteps = (steps: number) => {
    // Validate steps (must be between 1 and 6)
    if (steps < 1 || steps > 6) {
      return;
    }
    
    // Calculate remaining steps
    const remainingSteps = 7 - steps;
    
    // Clear previous selectable spaces/pegs
    setSelectableSpaceIds([]);
    setSelectablePegIds([]);
    
    // Update seven card state
    setSevenCardState(prev => ({
      ...prev,
      state: 'STEPS_CHOSEN',
      firstMoveSteps: steps,
      remainingSteps
    }));
    
    // Calculate selectable pegs for the first move
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    
    if (selectedCardId) {
      // Get possible moves for the first part
      const moves = getPossibleMoves(gameState, currentPlayer?.id, selectedCardId, { steps });
      
      // Identify selectable pegs
      const pegIds = new Set<string>();
      moves.forEach(move => pegIds.add(move.pegId));
      
      // Set selectable pegs
      const selectablePegIdsArray = Array.from(pegIds);
      setSelectablePegIds(selectablePegIdsArray);
      
      if (selectablePegIdsArray.length === 0) {
        setPromptMessage(`No valid moves available for ${steps} spaces. Choose a different number or try a regular move.`);
        setSevenCardState(prev => ({ ...prev, state: 'INITIAL', isSplit: false }));
        return;
      }
    }
    
    // Update prompt
    setPromptMessage(`Choose a peg to move ${steps} spaces for the first move`);
  };
  
  // Modify the useEffect to properly setup second move of 7 card split
  useEffect(() => {
    if (firstMoveCompleted) {
      Log('First move completed, setting up second move');
      
      // For 7 card split second move
      if (sevenCardState.state === 'FIRST_MOVE_COMPLETE' && sevenCardState.isSplit) {
        Log('Setting up 7 card split second move');
        Log('7 card state:', sevenCardState);
        
        // Ensure we have the necessary data for the second move
        if (!sevenCardState.remainingSteps || !selectedCardId || !sevenCardState.firstMovePegId) {
          Log('Missing data for 7 card second move setup');
          return;
        }
        
        // Get the current player
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        
        // Check if the selected card is still in the player's hand
        const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
        if (!selectedCard) {
          Log(`Selected card ${selectedCardId} not found in player's hand. This should be ok since we modified applyMove to keep the card.`);
          // No need to find a fallback card here - we'll handle that when the peg is selected
        } else {
          Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
        }
        
        // Select all pegs EXCEPT the one used for the first move
        const selectablePegs = currentPlayer?.pegs.filter(pegId => {
          // Skip the peg used in the first move
          if (pegId === sevenCardState.firstMovePegId) {
            Log(`Skipping peg ${pegId} as it was used for first move`);
            return false;
          }
          
          // Skip pegs in home slots (can't be moved with numbered cards)
          const pegSpace = findSpaceForPeg(gameState, pegId);
          if (!pegSpace) {
            Log(`Skipping peg ${pegId} as it was not found on the board`);
            return false;
          }
          
          if (pegSpace.type === 'home') {
            Log(`Skipping peg ${pegId} as it's in a home space`);
            return false;
          }
          
          if (pegSpace.type === 'castle') {
            Log(`Skipping peg ${pegId} as it's in a castle space`);
            return false;
          }
          
          Log(`Peg ${pegId} is selectable for second move (at space ${pegSpace.id})`);
          return true;
        });
        
        Log(`Found ${selectablePegs.length} possible pegs for second move (excluding first move peg and home/castle pegs)`);
        
        if (selectablePegs.length === 0) {
          Log('No selectable pegs for second move');
          setPromptMessage(`No valid pegs available for the remaining ${sevenCardState.remainingSteps} steps. End your turn.`);
        } else {
          // Set the selectable pegs and update UI state
          setSelectablePegIds(selectablePegs);
          setSevenCardState(prev => ({
            ...prev,
            state: 'SECOND_MOVE_READY',
            selectablePegsForSecondMove: selectablePegs
          }));
          setPromptMessage(`Select a different peg to move the remaining ${sevenCardState.remainingSteps} steps.`);
        }
      }
      // For 9 card split second move
      else if (nineCardState.state === 'FIRST_MOVE_COMPLETE' && nineCardState.firstMoveComplete) {
        Log('Setting up 9 card split second move');
        Log('9 card state:', nineCardState);
        
        // Ensure we have the necessary data for the second move
        if (!nineCardState.remainingSteps || !selectedCardId || !nineCardState.firstMovePegId || !nineCardState.direction) {
          Log('Missing data for 9 card second move setup');
          return;
        }
        
        // Get the current player
        const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
        
        // Check if the selected card is still in the player's hand
        const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
        if (!selectedCard) {
          Log(`Selected card ${selectedCardId} not found in player's hand. This should be ok since we modified applyMove to keep the card.`);
          // No need to find a fallback card here - we'll handle that when the peg is selected
        } else {
          Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
        }
        
        // For the second move of a 9 card, use the opposite direction
        const secondMoveDirection: 'forward' | 'backward' = nineCardState.direction === 'forward' ? 'backward' : 'forward';
        Log(`First move direction: ${nineCardState.direction}, second move direction: ${secondMoveDirection}`);
        
        // Select all pegs EXCEPT the one used for the first move
        const selectablePegs = currentPlayer?.pegs.filter(pegId => {
          // Skip the peg used in the first move
          if (pegId === nineCardState.firstMovePegId) {
            Log(`Skipping peg ${pegId} as it was used for first move`);
            return false;
          }
          
          // Skip pegs in home slots (can't be moved with numbered cards)
          const pegSpace = findSpaceForPeg(gameState, pegId);
          if (!pegSpace) {
            Log(`Skipping peg ${pegId} as it was not found on the board`);
            return false;
          }
          
          if (pegSpace.type === 'home') {
            Log(`Skipping peg ${pegId} as it's in a home space`);
            return false;
          }
          
          if (pegSpace.type === 'castle') {
            Log(`Skipping peg ${pegId} as it's in a castle space`);
            return false;
          }
          
          Log(`Peg ${pegId} is selectable for second move of 9 card (at space ${pegSpace.id})`);
          return true;
        });
        
        Log(`Found ${selectablePegs.length} possible pegs for 9 card second move (excluding first move peg and home/castle pegs)`);
        
        // Check if any of these pegs actually have valid moves
        let hasValidMoves = false;
        if (selectablePegs.length > 0) {
          // Get all possible moves for the second part of the 9 card
          const allPossibleMoves = getPossibleMoves(
            gameState,
            currentPlayer?.id,
            selectedCardId,
            {
              direction: secondMoveDirection,
              steps: nineCardState.remainingSteps,
              isSecondMove: true,
              firstMovePegId: nineCardState.firstMovePegId
            }
          );
          
          // Filter moves for selectable pegs only
          const validMoves = allPossibleMoves.filter(move => selectablePegs.includes(move.pegId));
          Log(`Found ${validMoves.length} valid moves for the second part of the 9 card split`);
          
          hasValidMoves = validMoves.length > 0;
        }
        
        // Calculate possible moves for each remaining peg to check if there are valid options
        if (selectablePegs.length === 0 || !hasValidMoves) {
          Log('No selectable pegs with valid moves for 9 card second move');
          setPromptMessage(`No valid moves available for the second part of your 9 card split.`);
          
          // Set a state to indicate no valid moves are available, so we can show a "Skip Second Move" button
          setNineCardState(prev => ({
            ...prev,
            state: 'NO_VALID_SECOND_MOVES',
            selectablePegsForSecondMove: []
          }));
        } else {
          // Set the selectable pegs and update UI state
          setSelectablePegIds(selectablePegs);
          setNineCardState(prev => ({
            ...prev,
            state: 'SECOND_MOVE_READY',
            selectablePegsForSecondMove: selectablePegs
          }));
          
          setPromptMessage(`Select a different peg to move ${nineCardState.remainingSteps} spaces ${secondMoveDirection}.`);
        }
      }
      
      // Reset the flag after setup is complete
      setFirstMoveCompleted(false);
    }
  }, [firstMoveCompleted, sevenCardState, nineCardState, gameState, selectedCardId]);
  
  // Modify handleSevenCardFirstMove to use detailed logging
  const handleSevenCardFirstMove = (pegId: string) => {
    Log(`handleSevenCardFirstMove called for peg ${pegId}`);
    Log(`Current sevenCardState:`, sevenCardState);
    
    // Ensure we have required state
    if (!sevenCardState.firstMoveSteps || !selectedCardId) {
      Log('Missing required state for first move');
      return;
    }
    
    // Get the current player and their available moves
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    
    // Get possible moves for this peg
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer?.id, 
      selectedCardId, 
      { steps: sevenCardState.firstMoveSteps }
    );
    
    Log(`Found ${moves.length} possible moves for peg ${pegId} with ${sevenCardState.firstMoveSteps} steps`);
    
    // Find the move for this peg
    const move = moves.find(m => m.pegId === pegId);
    
    if (!move || move.destinations.length === 0) {
      Log(`No valid move available for peg ${pegId}`);
      setPromptMessage('No valid move available for the selected peg. Please choose another peg.');
      return;
    }
    
    Log(`Selected move destination: ${move.destinations[0]}`);
    const destination = move.destinations[0];
    
    // Make sure the metadata is properly set for a split move
    const moveWithMetadata = {
      ...move,
      metadata: {
        ...move.metadata,
        sevenCardMove: {
          steps: sevenCardState.firstMoveSteps,
          isFirstMove: true
        }
      }
    };
    
    Log(`Applying first move with metadata:`, moveWithMetadata.metadata);
    
    // Apply the first move
    const result = applyMove(gameState, moveWithMetadata);
    
    // Update game state with the new state after the move
    setGameState(result.newState);
    
    // Clear prompt message immediately
    setPromptMessage('');
    
    // Clear selectable pegs temporarily
    setSelectablePegIds([]);
    setSelectableSpaceIds([]);
    
    // Show bump message if there was one
    if (result.bumpMessage) {
      setBumpMessage(result.bumpMessage);
    }
    
    // Update state all at once to ensure consistency
    setSevenCardState(prev => {
      const updatedState = {
        ...prev,
        state: 'FIRST_MOVE_COMPLETE' as const,
        firstMovePegId: pegId,
        firstMoveDestination: destination,
        remainingSteps: 7 - (sevenCardState.firstMoveSteps || 0)
      };
      Log(`Updated sevenCardState after first move:`, updatedState);
      return updatedState;
    });
    
    // Trigger the second move setup
    Log('Setting firstMoveCompleted to true to trigger second move setup');
    setFirstMoveCompleted(true);
  };
  
  // Modify handleSevenCardSecondMove with detailed logging
  const handleSevenCardSecondMove = (pegId: string) => {
    Log(`handleSevenCardSecondMove called for peg ${pegId}`);
    Log(`Current sevenCardState:`, sevenCardState);
    
    // Ensure we have required state
    if (!sevenCardState.remainingSteps || !selectedCardId || !sevenCardState.firstMovePegId) {
      Log('Missing required state for second move');
      setPromptMessage('Unable to complete the move. Please try again or end your turn.');
      return;
    }
    
    // Find the selected card in the player's hand
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
    
    if (!selectedCard) {
      Log(`Selected card not found: ${selectedCardId}`);
      // Try to find a 7 card in the player's hand as a fallback
      const sevenCard = currentPlayer?.hand.find(c => c.rank === '7');
      if (sevenCard) {
        Log(`Found alternate 7 card: ${sevenCard.id}`);
        // Update selectedCardId to use this card
        setSelectedCardId(sevenCard.id);
      } else {
        setPromptMessage('Card not found. Please try again or end your turn.');
        return;
      }
    }
    
    // Check if this peg is selectable (should be any valid peg that wasn't used for first move)
    if (!selectablePegIds.includes(pegId) && 
        !(sevenCardState.selectablePegsForSecondMove || []).includes(pegId)) {
      Log(`Peg ${pegId} is not in the selectable pegs list:`, selectablePegIds);
      setPromptMessage('That peg cannot be moved for the second part of the split.');
      return;
    }
    
    // Ensure not trying to move the same peg twice
    if (pegId === sevenCardState.firstMovePegId) {
      Log(`Cannot move the same peg ${pegId} for second move`);
      setPromptMessage('You must choose a different peg for the second move.');
      return;
    }

    // Get possible moves for this peg using getPossibleMoves which uses our updated getSevenSplitMoves
    const moves = getPossibleMoves(
      gameState,
      currentPlayer?.id,
      selectedCardId,
      {
        steps: sevenCardState.remainingSteps,
        isSecondMove: true,
        firstMovePegId: sevenCardState.firstMovePegId
      }
    );

    Log(`Found ${moves.length} possible moves for peg ${pegId} with remaining steps ${sevenCardState.remainingSteps}`);

    // Filter moves for this peg
    const pegMoves = moves.filter(move => move.pegId === pegId);
    Log(`Found ${pegMoves.length} moves specifically for peg ${pegId}`);

    if (pegMoves.length === 0) {
      Log(`No valid moves found for peg ${pegId}`);
      
      // Provide a more detailed error message
      const pegSpace = findSpaceForPeg(gameState, pegId);
      Log(`Peg ${pegId} is at space ${pegSpace?.id} (type: ${pegSpace?.type}, section: ${pegSpace?.sectionIndex}, index: ${pegSpace?.index})`);
      
      // Check if this peg is before the castle entrance and could potentially enter the castle
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(currentPlayer.id)
      );
      
      // Check if peg is before castle entrance in player's section
      const isBeforeCastleEntrance = pegSpace && 
                                     pegSpace.sectionIndex === playerSection?.index && 
                                     pegSpace.index < 3 && 
                                     (pegSpace.type === 'normal' || pegSpace.type === 'entrance');
      
      if (isBeforeCastleEntrance && pegSpace) {
        // Calculate if the remaining steps could let the peg enter the castle
        const stepsToEntrance = 3 - pegSpace.index;
        const remainingStepsForCastle = (sevenCardState.remainingSteps || 0) - stepsToEntrance;
        
        if (remainingStepsForCastle > 0) {
          // Calculate potential castle index (0-based)
          const potentialCastleIndex = remainingStepsForCastle - 1;
          
          // Log this information
          Log(`Peg is before castle entrance. Steps to entrance: ${stepsToEntrance}, remaining castle steps: ${remainingStepsForCastle}`);
          Log(`Potential castle index: ${potentialCastleIndex}`);
          
          // Check if any castle spaces at this index already have the player's pegs
          const targetCastleSpace = Array.from(gameState.board.allSpaces.values()).find(s => 
            s.sectionIndex === playerSection?.index && 
            s.type === 'castle' && 
            s.index === potentialCastleIndex
          );
          
          if (targetCastleSpace) {
            const hasCastlePeg = targetCastleSpace.pegs.some(existingPegId => {
              const [existingPlayerId] = existingPegId.split('-peg-');
              return existingPlayerId === currentPlayer.id;
            });
            
            if (hasCastlePeg) {
              Log(`Castle space ${targetCastleSpace.id} already has a peg, cannot enter`);
              setPromptMessage(`No valid moves available for this peg. The target castle space already has one of your pegs.`);
            } else {
              // This is unusual - the peg should be able to enter the castle
              Log(`Unexpected: Castle entry should be possible but no move was generated`);
              
              // Try a different approach - create and apply a castle entry move directly
              setPromptMessage(`Attempting to create a castle entry move for this peg...`);
              
              // Create a castle entry move manually
              const castleEntryMove: Move = {
                playerId: currentPlayer.id,
                cardId: selectedCardId,
                pegId: pegId,
                from: pegSpace.id,
                destinations: [targetCastleSpace.id],
                metadata: {
                  castleEntry: true,
                  castleMovement: true,
                  willPassCastleEntrance: true,
                  sevenCardMove: {
                    steps: sevenCardState.remainingSteps || 0,
                    isFirstMove: false
                  }
                }
              };
              
              // Apply the move
              const { newState } = applyMove(gameState, castleEntryMove);
              setGameState(newState);
              
              // Reset UI state
              setSelectedCardId(null);
              setSelectedPegId(null);
              setSelectableSpaceIds([]);
              setSelectablePegIds([]);
              setPromptMessage(`Moved peg into castle slot ${potentialCastleIndex + 1}`);
              
              // Reset seven card state
              setSevenCardState({
                state: 'INITIAL',
                isSplit: false
              });
              
              return;
            }
          }
        } else {
          Log(`Not enough steps to enter castle: needs ${stepsToEntrance}, has ${sevenCardState.remainingSteps || 0}`);
          setPromptMessage(`No valid moves available for this peg. It needs ${stepsToEntrance} steps to reach the castle entrance, but you only have ${sevenCardState.remainingSteps || 0} steps left.`);
        }
      } else {
        // Check for nearby pegs in same section that might be blocking
        const nearbyPegs = Array.from(gameState.board.allSpaces.values())
          .filter(s => pegSpace && s.sectionIndex === pegSpace.sectionIndex && 
                  s.type === 'normal' && 
                  s.index > pegSpace.index && 
                  s.index <= pegSpace.index + (sevenCardState.remainingSteps || 0))
          .flatMap(s => s.pegs)
          .filter(p => p.startsWith(currentPlayer.id));
          
        if (nearbyPegs.length > 0) {
          Log(`Found ${nearbyPegs.length} nearby pegs that might be blocking: ${nearbyPegs.join(', ')}`);
          setPromptMessage(`No valid moves available for this peg. It appears the path is blocked by your own pegs. Please choose another peg or end your turn.`);
        } else {
          setPromptMessage('No valid moves available for this peg. Please choose another peg or end your turn.');
        }
      }
      return;
    }

    // Check if any moves will pass or land on castle entrance
    const movesPassingCastle = pegMoves.filter(move => move.metadata?.willPassCastleEntrance);
    const movesLandingOnCastle = pegMoves.filter(move => move.metadata?.willLandOnCastleEntrance);
    
    Log(`Moves passing castle entrance: ${movesPassingCastle.length}`);
    Log(`Moves landing on castle entrance: ${movesLandingOnCastle.length}`);

    // Add castle entry options
    const castleEntryMoves = pegMoves.filter(move => move.metadata?.castleEntry);
    Log(`Castle entry moves: ${castleEntryMoves.length}`);

    // Handle castle entry decision if the move would pass the castle entrance but not land on it
    if (movesPassingCastle.length > 0 && !movesLandingOnCastle.length && castleEntryMoves.length > 0) {
      const regularMove = pegMoves.find(move => !move.metadata?.castleEntry);
      const castleMove = castleEntryMoves[0];
      
      if (regularMove && castleMove) {
        // Prompt the player with a choice
        setCastlePromptState({
          isActive: true,
          pegId,
          regularMove: regularMove,
          castleMove: castleMove
        });
        
        // Display a prompt message to the player
        setPromptMessage("Would you like this peg to go into your castle?");
        return;
      }
    }
    
    // Handle castle entry decision if landing exactly on castle entrance
    if (movesLandingOnCastle.length > 0) {
      // Find or create a castle entry move
      const castleEntryMove = castleEntryMoves.length > 0 ? castleEntryMoves[0] : null;
      const regularMove = movesLandingOnCastle[0]; // The move that lands on the entrance
      
      // Only prompt if we have both options
      if (castleEntryMove && regularMove) {
        Log(`Landing on castle entrance - prompting for entry choice`);
        // Prompt the player with a choice
        setCastlePromptState({
          isActive: true,
          pegId,
          regularMove: regularMove,
          castleMove: castleEntryMove
        });
        
        // Display a prompt message to the player
        setPromptMessage("Would you like this peg to go into your castle?");
        return;
      }
    }

    // If there's only one valid move (for cases with no castle options)
    if (pegMoves.length === 1) {
      // Take the single available move
      const moveToApply = pegMoves[0];
      
      Log(`Applying automatic move with single destination: ${moveToApply.destinations[0]}`);
      const result = applyMove(gameState, moveToApply);
      
      if (!result.newState) {
        Log('Failed to apply the single move');
        setPromptMessage('Failed to apply the move. Please try again or end your turn.');
        return;
      }
      
      // Update game state
      setGameState(result.newState);
      
      // Show bump message if there was one
      if (result.bumpMessage) {
        Log(`Bump message: ${result.bumpMessage}`);
        setBumpMessage(result.bumpMessage);
      }
      
      // Reset all related state
      setSevenCardState({ state: 'INITIAL', isSplit: false });
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setPromptMessage('');
      
      // Check if game is over
      if (isGameOver(result.newState)) {
        setGameState({...result.newState, phase: 'gameOver'});
        return;
      }
      
      // End the player's turn
      handleEndTurn(result.newState);
      return;
    }

    // If there are multiple regular moves or choices
    setSelectedPegId(pegId);
    const destinations = pegMoves.flatMap(move => move.destinations);
    setSelectableSpaceIds(destinations);
    setPromptMessage("Select a destination space for this peg");
  };
  
  // Add new function to handle the first part of the 9 card move
  const handleNineCardFirstMove = (pegId: string) => {
    Log(`handleNineCardFirstMove called for peg ${pegId}`);
    Log(`Current nineCardState:`, nineCardState);
    
    // Ensure we have required state
    if (!nineCardState.steps || !nineCardState.direction || !selectedCardId) {
      Log('Missing required state for 9 card first move');
      return;
    }
    
    // Get the current player and their available moves
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    // Create a properly typed direction variable
    const direction: 'forward' | 'backward' = nineCardState.direction;
    Log(`First move direction: ${direction}`);
    
    // Get possible moves for this peg
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer.id, 
      selectedCardId, 
      { 
        direction,
        steps: nineCardState.steps 
      }
    );
    
    Log(`Found ${moves.length} possible moves for peg ${pegId} with direction ${direction} and steps ${nineCardState.steps}`);
    
    // Find the move for this peg
    const move = moves.find(m => m.pegId === pegId);
    
    // Check if we have a castle entry move for this peg
    const castleEntryMove = moves.find(m => m.pegId === pegId && m.metadata?.castleEntry);
    
    // If we have a castle entry move but no regular move, use the castle entry move
    if (!move && castleEntryMove) {
      Log(`No regular move found, but found a castle entry move for peg ${pegId}`);
      
      // Find the player's section - this is where their castle is
      const playerSection = gameState.board.sections.find(section => 
        section.playerIds?.includes(currentPlayer.id)
      );
      if (!playerSection) {
        Log(`Could not find section for player ${currentPlayer.id}`);
        return;
      }
      
      // Get the player's section index
      const sectionIndex = playerSection.index;
      
      // Find the peg's space
      const pegSpace = findSpaceForPeg(gameState, pegId);
      if (!pegSpace) {
        Log(`Could not find space for peg ${pegId}`);
        return;
      }
      
      Log(`Using player's section index ${sectionIndex} for castle entry (peg is in section ${pegSpace.sectionIndex})`);
      
      // Calculate castle steps using the cross-section logic
      let stepsToEntrance = 0;
      
      // If peg is in a different section than the player's castle
      if (pegSpace.sectionIndex !== sectionIndex) {
        // Cross-section movement is more complex
        const orderedSpaces = Array.from(gameState.board.allSpaces.values())
          .filter(s => s.type === 'normal' || s.type === 'entrance' || s.type === 'corner')
          .sort((a, b) => {
            if (a.sectionIndex !== b.sectionIndex) {
              return a.sectionIndex - b.sectionIndex;
            }
            return a.index - b.index;
          });
        
        // Find current space and castle entrance indices in the flattened space array
        const currentSpaceIndex = orderedSpaces.findIndex(s => s.id === pegSpace.id);
        const castleEntranceIndex = orderedSpaces.findIndex(s => 
          s.sectionIndex === sectionIndex && s.type === 'entrance' && s.index === 3
        );
        
        if (currentSpaceIndex !== -1 && castleEntranceIndex !== -1) {
          // For forward movement, castle entrance should be ahead of current position 
          // or wrap around the board
          if (castleEntranceIndex > currentSpaceIndex) {
            // Castle entrance is ahead in the same circuit
            stepsToEntrance = castleEntranceIndex - currentSpaceIndex;
          } else {
            // Castle entrance is behind, need to go all the way around
            stepsToEntrance = (orderedSpaces.length - currentSpaceIndex) + castleEntranceIndex;
          }
          
          Log(`Cross-section castle entry: ${stepsToEntrance} steps from ${pegSpace.id} to castle entrance`);
        }
      } else {
        // Same section logic
        stepsToEntrance = pegSpace.index < 3 ? 3 - pegSpace.index : 0;
      }
      
      // Then subtract from total steps (plus 1 for the entrance itself)
      const castleSteps = nineCardState.steps - stepsToEntrance - 1;
      
      Log(`Steps to castle entrance: ${stepsToEntrance}, Remaining castle steps: ${castleSteps}`);
      
      // Only proceed if castle steps is valid (0-4)
      if (castleSteps >= 0 && castleSteps <= 4) {
        // Find the appropriate castle space (0-based index)
        const castleIndex = castleSteps;
        
        // Find the castle destination space
        const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(
          space => space.sectionIndex === sectionIndex && space.type === 'castle' && space.index === castleIndex
        );
        
        if (castleDestinationSpace) {
          Log(`Found castle destination space at index ${castleIndex}: ${castleDestinationSpace.id}`);
          
          // Create a proper castle move
          const properCastleMove = {
            ...castleEntryMove,
            destinations: [castleDestinationSpace.id],
            metadata: {
              ...castleEntryMove.metadata,
              castleEntry: true,
              castleMovement: true
            }
          };
          
          // Set up prompt state for castle choice
          setCastlePromptState({
            isActive: true,
            pegId: pegId,
            castleMove: properCastleMove,
            regularMove: undefined // No regular move available
          });
          
          setPromptMessage('Do you want to enter the castle?');
          return;
        }
      }
    }
    
    if (move && move.destinations.length > 0) {
      const destination = move.destinations[0];
      Log(`Selected destination for first move: ${destination}`);
      
      // Apply the first move with our fixed direction and mark as multi-part move
      const moveWithMetadata = {
        ...move,
        metadata: {
          ...move.metadata,
          nineCardMove: {
            direction,
            steps: nineCardState.steps,
            isFirstMove: true,
            isFirstMoveOfMultiPartMove: true  // Add this flag to match the 7 card implementation
          }
        }
      };
      
      Log(`Applying first move with metadata:`, moveWithMetadata.metadata);
      
      // Check if this move passes or lands on a castle entrance and player has the option to enter
      if ((moveWithMetadata.metadata?.willPassCastleEntrance || moveWithMetadata.metadata?.willLandOnCastleEntrance) && 
          direction === 'forward') {
        Log('Move passes or lands on castle entrance. Prompting player for choice...');
        
        // Find the castle entrance space for this section
        const peg = currentPlayer.pegs.find(p => p === pegId);
        if (!peg) {
          Log(`Could not find peg ${pegId} for player ${currentPlayer.id}`);
          return;
        }
        
        // Find the peg's space
        const pegSpace = findSpaceForPeg(gameState, pegId);
        if (!pegSpace) {
          Log(`Could not find space for peg ${pegId}`);
          return;
        }
        
        // Find the player's section - this is where their castle is
        const playerSection = gameState.board.sections.find(section => 
          section.playerIds?.includes(currentPlayer.id)
        );
        if (!playerSection) {
          Log(`Could not find section for player ${currentPlayer.id}`);
          return;
        }
        
        // Get the player's section index
        const sectionIndex = playerSection.index;
        Log(`Using player's section index ${sectionIndex} for castle entry (peg is in section ${pegSpace.sectionIndex})`);
        
        // Find the castle entrance space for this section
        const castleEntranceSpace = Array.from(gameState.board.allSpaces.values()).find(
          space => space.sectionIndex === sectionIndex && space.type === 'entrance' && space.index === 3
        );
        
        if (!castleEntranceSpace) {
          Log(`Could not find castle entrance space for section ${sectionIndex}`);
          return;
        }
        
        // Calculate steps for castle movement
        // When a peg passes castle entrance, we need to calculate how many steps it would take after entering
        // First, calculate steps to reach the entrance
        let stepsToEntrance = 0;
        
        // If peg is in the same section as the player's castle
        if (pegSpace.sectionIndex === sectionIndex) {
          // If peg is before the castle entrance (in its own section)
          stepsToEntrance = pegSpace.index < 3 ? 3 - pegSpace.index : 0;
        } else {
          // Cross-section movement is more complex:
          // 1. Steps from current position to end of section
          // 2. Steps through any intermediate sections
          // 3. Steps from start of player's section to castle entrance (index 3)
          
          // Find all spaces in order by section and index
          const orderedSpaces = Array.from(gameState.board.allSpaces.values())
            .filter(s => s.type === 'normal' || s.type === 'entrance' || s.type === 'corner')
            .sort((a, b) => {
              if (a.sectionIndex !== b.sectionIndex) {
                return a.sectionIndex - b.sectionIndex;
              }
              return a.index - b.index;
            });
          
          // Find current space and castle entrance indices in the flattened space array
          const currentSpaceIndex = orderedSpaces.findIndex(s => s.id === pegSpace.id);
          const castleEntranceIndex = orderedSpaces.findIndex(s => 
            s.sectionIndex === sectionIndex && s.type === 'entrance' && s.index === 3
          );
          
          if (currentSpaceIndex !== -1 && castleEntranceIndex !== -1) {
            // For forward movement, castle entrance should be ahead of current position 
            // or wrap around the board
            if (castleEntranceIndex > currentSpaceIndex) {
              // Castle entrance is ahead in the same circuit
              stepsToEntrance = castleEntranceIndex - currentSpaceIndex;
            } else {
              // Castle entrance is behind, need to go all the way around
              stepsToEntrance = (orderedSpaces.length - currentSpaceIndex) + castleEntranceIndex;
            }
            
            Log(`Cross-section castle entry: ${stepsToEntrance} steps from ${pegSpace.id} to castle entrance`);
          }
        }
        
        // Then subtract from total steps (plus 1 for the entrance itself)
        const castleSteps = nineCardState.steps - stepsToEntrance - 1;
        
        Log(`Steps to castle entrance: ${stepsToEntrance}, Remaining castle steps: ${castleSteps}`);
        
        // Only allow castle entry if there are valid steps (0-4) remaining
        if (castleSteps < 0 || castleSteps > 4) {
          Log(`Castle steps ${castleSteps} is out of valid range (0-4), skipping castle entry option`);
          
          // Apply the regular move instead since castle entry is not valid
          const result = applyMove(gameState, moveWithMetadata);
          setGameState(result.newState);
          setPromptMessage('');
          setSelectablePegIds([]);
          setSelectableSpaceIds([]);
          
          if (result.bumpMessage) {
            setBumpMessage(result.bumpMessage);
          }
          
          // First move steps, calculate remaining steps for second move
          const firstMoveSteps = nineCardState.steps;
          const remainingSteps = 9 - firstMoveSteps;
          Log(`First move steps: ${firstMoveSteps}, calculated remaining steps: ${remainingSteps}, adjusted to: ${remainingSteps}`);
          
          // Setup for second move for split nine
          if (nineCardState.splitSelected) {
            Log(`Setting firstMoveCompleted to true to trigger second move setup`);
            setNineCardState({
              ...nineCardState,
              state: 'FIRST_MOVE_COMPLETE',
              firstMoveComplete: true,
              firstMovePegId: pegId,
              remainingSteps: remainingSteps
            });
          } else {
            // For regular nine, complete the turn
            Log(`Completing regular nine card move`);
            handleEndTurn(result.newState);
          }
          
          return;
        }
        
        // Find the appropriate castle space (0-based index)
        const castleIndex = Math.min(castleSteps, 4); // Castle has positions 0-4
        
        // Find the castle destination space
        const castleDestinationSpace = Array.from(gameState.board.allSpaces.values()).find(
          space => space.sectionIndex === sectionIndex && space.type === 'castle' && space.index === castleIndex
        );
        
        if (!castleDestinationSpace) {
          Log(`Could not find castle destination space at index ${castleIndex}`);
          return;
        }
        
        // Create a castle move
        const castleMove = {
          ...moveWithMetadata,
          destinations: [castleDestinationSpace.id],
          metadata: {
            ...moveWithMetadata.metadata,
            castleEntry: true,
            castleMovement: true
          }
        };
        
        Log(`Created castle move to ${castleDestinationSpace.id}`);
        
        // Set up prompt state for castle choice
        setCastlePromptState({
          isActive: true,
          pegId: pegId,
          castleMove: castleMove,
          regularMove: moveWithMetadata
        });
        
        setPromptMessage('Do you want to enter the castle?');
        return;
      }
      
      // Apply the move
      const result = applyMove(gameState, moveWithMetadata);
      
      // Update game state with the new state after the move
      setGameState(result.newState);
      
      // Clear prompt message immediately
      setPromptMessage('');
      
      // Clear selectable pegs temporarily
      setSelectablePegIds([]);
      setSelectableSpaceIds([]);
      
      // Show bump message if there was one
      if (result.bumpMessage) {
        setBumpMessage(result.bumpMessage);
      }
      
      // First move steps, calculate remaining steps for second move
      const firstMoveSteps = nineCardState.steps;
      const remainingSteps = 9 - firstMoveSteps;
      Log(`First move steps: ${firstMoveSteps}, calculated remaining steps: ${remainingSteps}, adjusted to: ${remainingSteps}`);
      
      // Update state all at once to ensure consistency
      setNineCardState({
        ...nineCardState,
        state: 'FIRST_MOVE_COMPLETE',
        firstMoveComplete: true,
        firstMovePegId: pegId,
        remainingSteps: remainingSteps
      });
      
      Log(`Setting firstMoveCompleted to true to trigger second move setup`);
      Log(`Updated nineCardState after first move:`, { 
        ...nineCardState, 
        state: 'FIRST_MOVE_COMPLETE', 
        firstMoveComplete: true,
        firstMovePegId: pegId,
        remainingSteps
      });
      
      // Setup for the second move
      handleFirstMoveComplete(pegId, remainingSteps);
    }
  };

  // Helper function to set up the second move of a 9 card split
  const handleFirstMoveComplete = (pegId: string, remainingSteps: number) => {
    Log('First move completed, setting up second move');
    Log('Setting up 9 card split second move');
    Log(`9 card state: ${JSON.stringify(nineCardState)}`);
    
    // Find the selected card in the player's hand
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const selectedCard = currentPlayer.hand.find(c => c.id === selectedCardId);
    
    if (!selectedCard) {
      Log(`Could not find selected card ${selectedCardId} in player's hand`);
      return;
    }
    
    Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
    
    // For the second move, we use the opposite direction
    const secondMoveDirection: 'forward' | 'backward' = 
      nineCardState.direction === 'forward' ? 'backward' : 'forward';
    
    Log(`First move direction: ${nineCardState.direction}, second move direction: ${secondMoveDirection}`);
    
    // For 9 card, enforce that total steps must equal 9
    const firstMoveSteps = nineCardState.steps || 0;
    const secondMoveSteps = 9 - firstMoveSteps;
    
    Log(`First move used ${firstMoveSteps} steps, second move will use ${secondMoveSteps} steps (total: 9)`);
    
    // Find selectable pegs for the second move (all pegs EXCEPT the one used in the first move)
    const selectablePegs = currentPlayer.pegs.filter(pegId => {
      // Skip the peg used in the first move
      if (pegId === nineCardState.firstMovePegId) {
        Log(`Skipping peg ${pegId} as it was used for first move`);
        return false;
      }
      
      // Skip pegs that are in castle spaces
      const pegSpace = findSpaceForPeg(gameState, pegId);
      if (pegSpace?.type === 'castle') {
        Log(`Skipping peg ${pegId} as it's in a castle space`);
        return false;
      }
      
      // Skip pegs that are in home spaces
      if (pegSpace?.type === 'home') {
        Log(`Skipping peg ${pegId} as it's in a home space`);
        return false;
      }
      
      // This peg is selectable
      Log(`Peg ${pegId} is selectable for second move of 9 card (at space ${pegSpace?.id})`);
      return true;
    });
    
    Log(`Found ${selectablePegs.length} possible pegs for 9 card second move (excluding first move peg and home/castle pegs)`);
    
    // Check if there are valid moves for any of these pegs
    let hasValidMoves = false;
    selectablePegs.forEach(pegId => {
      const moves = getPossibleMoves(
        gameState, 
        currentPlayer.id, 
        selectedCardId || '', 
        {
          direction: secondMoveDirection,
          steps: secondMoveSteps, // Use secondMoveSteps here instead of remainingSteps
          isSecondMove: true,
          firstMovePegId: nineCardState.firstMovePegId
        }
      );
      
      if (moves.length > 0) {
        hasValidMoves = true;
      }
    });
    
    if (!hasValidMoves) {
      Log('No valid moves for any peg in second part of 9 card split');
      setNineCardState(prev => ({
        ...prev,
        state: 'NO_VALID_SECOND_MOVES'
      }));
      setPromptMessage('No valid moves available for the second part of your 9 card split.');
      return;
    }
    
    // Set the selectable pegs for the second move
    setSelectablePegIds(selectablePegs);
    setNineCardState(prev => ({
      ...prev,
      state: 'SECOND_MOVE_READY',
      remainingSteps: secondMoveSteps // Store the correct secondMoveSteps value
    }));
    
    setPromptMessage('Select a different peg for the second part of your 9 card split.');
  };

  // Add a new function to handle the second part of the 9 card move
  const handleNineCardSecondMove = (pegId: string) => {
    Log(`handleNineCardSecondMove called for peg ${pegId}`);
    Log(`Current nineCardState:`, nineCardState);
    
    // Ensure we have required state
    if (!nineCardState.remainingSteps || !selectedCardId || !nineCardState.firstMovePegId || !nineCardState.direction) {
      Log('Missing required state for 9 card second move');
      setPromptMessage('Unable to complete the move. Please try again or end your turn.');
      return;
    }
    
    // Find the selected card in the player's hand
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
    
    if (!selectedCard) {
      Log(`Selected card not found: ${selectedCardId}`);
      // Try to find a 9 card in the player's hand as a fallback
      const nineCard = currentPlayer?.hand.find(c => c.rank === '9');
      if (nineCard) {
        Log(`Found alternate 9 card: ${nineCard.id}`);
        // Update selectedCardId to use this card
        setSelectedCardId(nineCard.id);
      } else {
        Log(`No 9 card found in player's hand. Unable to complete move.`);
        setPromptMessage('Card not found. Please try again or end your turn.');
        return;
      }
    } else {
      Log(`Found selected card in player's hand: ${selectedCard.rank} of ${selectedCard.suit}`);
    }
    
    // Ensure this peg is actually selectable
    if (!selectablePegIds.includes(pegId) && 
        !(nineCardState.selectablePegsForSecondMove || []).includes(pegId)) {
      Log(`Peg ${pegId} is not in the selectable pegs list:`, selectablePegIds);
      setPromptMessage('That peg cannot be moved for the second part of the 9 card.');
      return;
    }
    
    // Ensure not trying to move the same peg twice
    if (pegId === nineCardState.firstMovePegId) {
      Log(`Cannot move the same peg ${pegId} for second move`);
      setPromptMessage('You must choose a different peg for the second move.');
      return;
    }
    
    // Get possible moves for this peg and remaining steps
    Log(`Getting possible moves for peg ${pegId} for second part of 9 card split`);
    
    // For the second move of a 9 card, use the opposite direction
    const secondMoveDirection: 'forward' | 'backward' = nineCardState.direction === 'forward' ? 'backward' : 'forward';
    Log(`First move direction: ${nineCardState.direction}, second move direction: ${secondMoveDirection}`);
    
    const moves = getPossibleMoves(
      gameState, 
      currentPlayer?.id, 
      selectedCardId, 
      { 
        direction: secondMoveDirection,
        steps: nineCardState.remainingSteps,
        isSecondMove: true,
        firstMovePegId: nineCardState.firstMovePegId
      }
    );
    
    Log(`Found ${moves.length} possible moves for peg ${pegId} with direction ${secondMoveDirection} and steps ${nineCardState.remainingSteps}`);
    
    // Find moves for this peg
    const pegMoves = moves.filter(m => m.pegId === pegId);
    
    if (pegMoves.length === 0) {
      Log(`No move found for peg ${pegId}`);
      setPromptMessage('No valid move available for the selected peg. Please choose another peg or end your turn.');
      return;
    }
    
    // Check if there are any castle entry moves
    const regularMoves = pegMoves.filter(move => !move.metadata?.castleMovement);
    const castleMoves = pegMoves.filter(move => move.metadata?.castleMovement);
    
    Log(`Peg ${pegId} has ${regularMoves.length} regular moves and ${castleMoves.length} castle moves`);
    
    // ALWAYS prompt for castle entry if there are castle moves available
    // This is a key change to ensure castle entry is never automatic
    if (castleMoves.length > 0) {
      // Check if the peg is already in a castle
      const pegSpace = findSpaceForPeg(gameState, pegId);
      const isAlreadyInCastle = pegSpace && pegSpace.type === 'castle';
      
      Log(`Peg ${pegId} is at space ${pegSpace?.id}, isAlreadyInCastle: ${isAlreadyInCastle}`);
      
      // If peg is already in castle, don't prompt for castle entry - just apply the move
      if (isAlreadyInCastle) {
        Log(`Peg ${pegId} is already in castle - applying castle move without prompt`);
        const move = castleMoves[0];
        
        const { newState, bumpMessage } = applyMove(gameState, move);
        setGameState(newState);
        setBumpMessage(bumpMessage);
        setSelectableSpaceIds([]);
        setPromptMessage("Move applied!");
        handleEndTurn(newState);
        return;
      }
      
      // Only show prompt if peg is not already in castle
      Log(`Castle moves available, prompting player about castle entry for peg ${pegId}`);
      
      // Store the moves and activate the castle prompt
      setCastlePromptState({
        isActive: true,
        pegId,
        regularMove: regularMoves.length > 0 ? regularMoves[0] : undefined,
        castleMove: castleMoves[0]
      });
      
      // Display a prompt to the player
      setPromptMessage("Would you like this peg to go into your castle?");
      return;
    } 
    
    // If we only have a single move (either regular or castle), apply it
    if (pegMoves.length === 1) {
      const move = pegMoves[0];
      
      if (move.destinations.length === 0) {
        Log(`Move has no destinations for peg ${pegId}`);
        setPromptMessage('No valid destination for the selected peg. Please choose another peg or end your turn.');
        return;
      }
      
      const destination = move.destinations[0];
      Log(`Selected destination for second move: ${destination}`);
      
      // Apply the move with metadata
      const moveWithMetadata = {
        ...move,
        metadata: {
          ...move.metadata,
          nineCardMove: {
            direction: secondMoveDirection,
            steps: nineCardState.remainingSteps,
            isFirstMove: false
          }
        }
      };
      
      Log(`Applying second move with metadata:`, moveWithMetadata.metadata);
      
      // Apply the move and handle the result
      const result = applyMove(gameState, moveWithMetadata);
      
      // Update game state
      setGameState(result.newState);
      
      // Show bump message if there was one
      if (result.bumpMessage) {
        Log(`Bump message: ${result.bumpMessage}`);
        setBumpMessage(result.bumpMessage);
      }
      
      // Reset selection state
      setSelectedPegId(null);
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setPromptMessage('');
      
      // Reset nine card state
      setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
      
      // End the player's turn
      Log('Completing 9 card split move and ending turn');
      handleEndTurn(result.newState);
      return;
    }
    
    // Multiple destinations, let the player select the destination
    setSelectedPegId(pegId);
    const possibleDestinations = pegMoves.flatMap(move => move.destinations);
    setSelectableSpaceIds(possibleDestinations);
    setPromptMessage("Select a destination space for this peg");
  };
  
  // Add this function to handle castle choice
  const handleCastleChoice = (enterCastle: boolean) => {
    Log(`Castle choice made: ${enterCastle ? 'Enter Castle' : 'Continue on Board'}`);
    
    // Choose the appropriate move based on player's choice
    const moveToApply = enterCastle ? castlePromptState.castleMove : castlePromptState.regularMove;
    
    if (!moveToApply) {
      Log('Error: No move available for the chosen option');
      
      // If they chose not to enter the castle but there's no regular move available,
      // show a message explaining why and reset the prompt
      if (!enterCastle) {
        Log('Regular move is not available - likely blocked by another peg');
        setPromptMessage('Cannot make a regular move - the path is blocked by another peg.');
        
        // Keep the castle prompt active so they can choose to enter the castle
        setTimeout(() => {
          setPromptMessage("Would you like this peg to go into your castle?");
        }, 2000);
        
        return;
      }
      
      setCastlePromptState({ isActive: false, pegId: '' });
      return;
    }
    
    // Apply the chosen move
    const { newState, bumpMessage } = applyMove(gameState, moveToApply);
    setGameState(newState);
    setBumpMessage(bumpMessage);
    
    // Reset states
    setSelectableSpaceIds([]);
    setPromptMessage("Move applied!");
    setCastlePromptState({ isActive: false, pegId: '' });
    
    // Check if we're in the middle of a 9 card split move
    if (nineCardState.state === 'STEPS_CHOSEN' && nineCardState.splitSelected && !nineCardState.firstMoveComplete) {
      Log('Castle move was part of a 9 card split first move, setting up second move');
      
      // Update nine card state to indicate first move is complete
      setNineCardState(prev => ({
        ...prev,
        state: 'FIRST_MOVE_COMPLETE',
        firstMoveComplete: true,
        firstMovePegId: castlePromptState.pegId,
        remainingSteps: nineCardState.steps
      }));
      
      // Set up second move
      handleFirstMoveComplete(castlePromptState.pegId, nineCardState.steps || 0);
    } else {
      // End the player's turn if not part of a split move
      handleEndTurn(newState);
    }
  };
  
  // Modify handlePegSelect with castle entrance checking
  const handlePegSelect = (pegId: string) => {
    // Special handling for dev mode - move pegs feature
    if (devMode && movePegsMode) {
      // In move pegs mode, we allow selecting any peg from any player
      Log(`Dev mode - move pegs: Selected peg ${pegId}`);
      setSelectedPegId(pegId);
      
      // Make all spaces selectable, except those already containing a peg
      const allValidSpaces = Array.from(gameState.board.allSpaces.values())
        .filter(space => {
          // A space is valid if it's not fully occupied
          // We still need to prevent moving to completely full spaces
          const isFullHome = space.type === 'home' && space.pegs.length >= 4;
          const isFullCastle = space.type === 'castle' && space.pegs.length >= 1;
          return !isFullHome && !isFullCastle;
        })
        .map(space => space.id);
      
      setSelectableSpaceIds(allValidSpaces);
      setPromptMessage('Click on any highlighted space to move the selected peg.');
      return;
    }
  
    // If no card is selected, early return
    if (!selectedCardId) {
      Log(`Peg selected without a card: ${pegId}`);
      return;
    }
    
    const selectedCard = gameState?.players[gameState?.currentPlayerIndex]?.hand.find(card => card.id === selectedCardId);
    if (!selectedCard) {
      Log(`Selected card not found: ${selectedCardId}`);
      return;
    }
    
    Log(`handlePegSelect: peg=${pegId}, card=${selectedCard.rank}, sevenCardState=${sevenCardState.state}, nineCardState=${nineCardState.state}`);
    
    // In 7 card split, handle differently based on state
    if (selectedCard.rank === '7' && sevenCardState.isSplit) {
      Log(`7 card split handling: state=${sevenCardState.state}`);
      
      // First part of the move
      if (sevenCardState.state === 'STEPS_CHOSEN') {
        Log(`Handling first move of 7 card split`);
        handleSevenCardFirstMove(pegId);
        return;
      } 
      // Second part of the move
      else if (sevenCardState.state === 'SECOND_MOVE_READY' || sevenCardState.state === 'FIRST_MOVE_COMPLETE') {
        Log(`Handling second move of 7 card split`);
        
        // Check if peg is in either current selectablePegIds or stored selectablePegs
        const isSelectable = selectablePegIds.includes(pegId) || 
                          (sevenCardState.selectablePegsForSecondMove || []).includes(pegId);
        
        Log(`Peg ${pegId} selectable? ${isSelectable}`);
        Log(`selectablePegIds:`, selectablePegIds);
        Log(`sevenCardState.selectablePegsForSecondMove:`, sevenCardState.selectablePegsForSecondMove);
        
        if (!isSelectable) {
          setPromptMessage('That peg cannot be moved for the second part of the split.');
          return;
        }

        if (pegId === sevenCardState.firstMovePegId) {
          setPromptMessage('You must choose a different peg for the second move.');
          return;
        }

        handleSevenCardSecondMove(pegId);
        return;
      }
    }
    // Regular 7 card (non-split) move
    else if (selectedCard.rank === '7' && !sevenCardState.isSplit) {
      Log(`Handling regular 7 card move (non-split)`);
      
      // For non-split 7 card, use the regular move logic
      setSelectedPegId(pegId);
      
      const moves = getPossibleMoves(gameState, gameState?.players[gameState?.currentPlayerIndex]?.id, selectedCardId);
      const possibleDestinations = moves
        .filter(move => move.pegId === pegId)
        .flatMap(move => move.destinations);
      
      Log(`Found ${possibleDestinations.length} possible destinations for regular 7 card move`);
      
      if (possibleDestinations.length === 0) {
        setPromptMessage("No valid moves for this peg with the selected card");
        setSelectedCardId('');
        return;
      }
      
      if (possibleDestinations.length === 1) {
        const move = {
          playerId: gameState?.players[gameState?.currentPlayerIndex]?.id,
          cardId: selectedCardId,
          pegId: pegId,
          from: '',
          destinations: possibleDestinations
        };
        
        Log(`Applying automatic move with single destination: ${possibleDestinations[0]}`);
        const { newState, bumpMessage } = applyMove(gameState, move);
        setGameState(newState);
        setBumpMessage(bumpMessage);
        setSelectableSpaceIds([]);
        setPromptMessage("Move applied!");
        handleEndTurn(newState);
      } else {
        setSelectableSpaceIds(possibleDestinations);
        setPromptMessage("Click on a highlighted space to move your peg");
      }
      return;
    }
    // Handle 9 card special case for first move
    else if (selectedCard.rank === '9' && nineCardState.state === 'STEPS_CHOSEN') {
      Log(`Handling first move of 9 card with steps=${nineCardState.steps}`);
      
      // For regular 9 card move with no split
      if (nineCardState.steps === 9 && !nineCardState.firstMoveComplete) {
        Log('Handling regular (non-split) 9 card move');
        
        // For non-split 9 card, use the regular move logic
        setSelectedPegId(pegId);
        
        const moves = getPossibleMoves(
          gameState, 
          gameState?.players[gameState?.currentPlayerIndex]?.id, 
          selectedCardId,
          {
            direction: 'forward',
            steps: 9
          }
        );
        
        // Find the specific moves for this peg
        const pegMoves = moves.filter(move => move.pegId === pegId);
        Log(`Found ${pegMoves.length} possible moves for peg ${pegId} with regular 9 card move`);
        
        if (pegMoves.length === 0) {
          setPromptMessage("No valid moves for this peg with the selected card");
          return;
        }
        
        if (pegMoves.length === 1) {
          const move = pegMoves[0];
          
          // Apply the move
          Log(`Applying automatic move with single destination: ${move.destinations[0]}`);
          const { newState, bumpMessage } = applyMove(gameState, move);
          setGameState(newState);
          setBumpMessage(bumpMessage);
          setSelectableSpaceIds([]);
          setPromptMessage("Move applied!");
          
          // Reset selection state
          setSelectedPegId(null);
          setSelectedCardId('');
          setSelectableSpaceIds([]);
          setSelectablePegIds([]);
          setPromptMessage('');
          
          // Reset nine card state
          setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
          
          // End turn
          handleEndTurn(newState);
          return;
        } else {
          // Multiple destinations, let the player select where to go
          const possibleDestinations = pegMoves.flatMap(move => move.destinations);
          setSelectableSpaceIds(possibleDestinations);
          setPromptMessage("Click on a highlighted space to move your peg");
          return;
        }
      }
      
      // Otherwise, handle the first move of a split 9 card
      handleNineCardFirstMove(pegId);
      return;
    }
    // Handle 9 card second move
    else if (selectedCard.rank === '9' && (nineCardState.state === 'SECOND_MOVE_READY' || nineCardState.state === 'FIRST_MOVE_COMPLETE') && nineCardState.firstMoveComplete) {
      Log(`Handling second move of 9 card split`);
      
      // Check if peg is in either current selectablePegIds or stored selectablePegs
      const isSelectable = selectablePegIds.includes(pegId) || 
                         (nineCardState.selectablePegsForSecondMove || []).includes(pegId);
      
      Log(`Peg ${pegId} selectable? ${isSelectable}`);
      Log(`selectablePegIds:`, selectablePegIds);
      Log(`nineCardState.selectablePegsForSecondMove:`, nineCardState.selectablePegsForSecondMove);
      
      if (!isSelectable) {
        setPromptMessage('That peg cannot be moved for the second part of the split.');
        return;
      }

      if (pegId === nineCardState.firstMovePegId) {
        setPromptMessage('You must choose a different peg for the second move.');
        return;
      }

      handleNineCardSecondMove(pegId);
      return;
    }
    // Regular move for all other cards (including King, Queen, Jack, etc)
    else {
      Log(`Handling regular move for ${selectedCard.rank} card`);
      setSelectedPegId(pegId);
      
      const moves = getPossibleMoves(gameState, gameState?.players[gameState?.currentPlayerIndex]?.id, selectedCardId);
      
      // Filter moves for the selected peg
      const pegMoves = moves.filter(move => move.pegId === pegId);
      
      // Check if any of these moves would pass the castle entrance
      const willPassCastleEntrance = pegMoves.some(move => move.metadata?.willPassCastleEntrance);
      
      // Check if any of these moves would land exactly on the castle entrance
      const willLandOnCastleEntrance = pegMoves.some(move => move.metadata?.willLandOnCastleEntrance);
      
      // Group moves by regular vs castle entry
      const regularMoves = pegMoves.filter(move => !move.metadata?.castleMovement);
      const castleMoves = pegMoves.filter(move => move.metadata?.castleMovement);
      
      Log(`Found ${pegMoves.length} possible moves for ${selectedCard.rank} card move`);
      Log(`Regular moves: ${regularMoves.length}, Castle moves: ${castleMoves.length}`);
      Log(`Will pass castle entrance? ${willPassCastleEntrance}`);
      Log(`Will land on castle entrance? ${willLandOnCastleEntrance}`);
      
      if (pegMoves.length === 0) {
        setPromptMessage("No valid moves for this peg with the selected card");
        setSelectedCardId(null);
        return;
      }
      
      // ALWAYS prompt for castle entry if there are castle moves available
      // This is a key change to ensure castle entry is never automatic
      if (castleMoves.length > 0) {
        // Check if the peg is already in a castle
        const pegSpace = findSpaceForPeg(gameState, pegId);
        const isAlreadyInCastle = pegSpace && pegSpace.type === 'castle';
        
        Log(`Peg ${pegId} is at space ${pegSpace?.id}, isAlreadyInCastle: ${isAlreadyInCastle}`);
        
        // If peg is already in castle, don't prompt for castle entry - just apply the move
        if (isAlreadyInCastle) {
          Log(`Peg ${pegId} is already in castle - applying castle move without prompt`);
          const move = castleMoves[0];
          
          const { newState, bumpMessage } = applyMove(gameState, move);
          setGameState(newState);
          setBumpMessage(bumpMessage);
          setSelectableSpaceIds([]);
          setPromptMessage("Move applied!");
          handleEndTurn(newState);
          return;
        }
        
        // Only show prompt if peg is not already in castle
        Log(`Castle moves available, prompting player about castle entry for peg ${pegId}`);
        
        // Store the moves and activate the castle prompt
        setCastlePromptState({
          isActive: true,
          pegId,
          regularMove: regularMoves.length > 0 ? regularMoves[0] : undefined,
          castleMove: castleMoves[0]
        });
        
        // Display a prompt to the player
        setPromptMessage("Would you like this peg to go into your castle?");
        return;
      }
      
      // If peg will land exactly on castle entrance, treat it as a regular move
      if (willLandOnCastleEntrance && !willPassCastleEntrance) {
        Log(`Peg will land exactly on castle entrance - treating as a regular move`);
        
        if (regularMoves.length === 1) {
          const move = regularMoves[0];
          
          Log(`Applying automatic move to castle entrance: ${move.destinations[0]}`);
          const { newState, bumpMessage } = applyMove(gameState, move);
          setGameState(newState);
          setBumpMessage(bumpMessage);
          setSelectableSpaceIds([]);
          setPromptMessage("Move applied!");
          handleEndTurn(newState);
          return;
        }
      }
      
      // For single destination moves with no castle choice
      if (pegMoves.length === 1) {
        const move = pegMoves[0];
        
        Log(`Applying automatic move with single destination: ${move.destinations[0]}`);
        const { newState, bumpMessage } = applyMove(gameState, move);
        setGameState(newState);
        setBumpMessage(bumpMessage);
        setSelectableSpaceIds([]);
        setPromptMessage("Move applied!");
        handleEndTurn(newState);
      } else {
        // For multiple destination options
        const possibleDestinations = pegMoves.flatMap(move => move.destinations);
        setSelectableSpaceIds(possibleDestinations);
        setPromptMessage("Click on a highlighted space to move your peg");
      }
    }
  };
  
  // Handle space selection for peg movement
  const handleSpaceSelect = (spaceId: string) => {
    logDebug(`Space clicked: ${spaceId}, Selected Peg: ${selectedPegId}, Is selectable: ${selectableSpaceIds.includes(spaceId)}`);
    
    // Special handling for dev mode - move pegs feature
    if (devMode && movePegsMode && selectedPegId && selectableSpaceIds.includes(spaceId)) {
      Log(`Dev mode - move pegs: Moving peg ${selectedPegId} to space ${spaceId}`);
      
      // Create a new game state with the peg moved
      const newState = { ...gameState };
      
      // Find the current space where the peg is located
      let currentSpace: BoardSpace | undefined;
      for (const space of Array.from(newState.board.allSpaces.values())) {
        if (space.pegs.includes(selectedPegId)) {
          currentSpace = space;
          break;
        }
      }
      
      // If we found the current space, remove the peg from it
      if (currentSpace) {
        currentSpace.pegs = currentSpace.pegs.filter(id => id !== selectedPegId);
      }
      
      // Add the peg to the new space
      const destinationSpace = newState.board.allSpaces.get(spaceId);
      if (destinationSpace) {
        destinationSpace.pegs.push(selectedPegId);
      }
      
      // Update the game state
      setGameState(newState);
      
      // Reset selection state
      setSelectedPegId(null);
      setSelectableSpaceIds([]);
      setPromptMessage('Peg moved successfully. Dev mode - move pegs is still active.');
      return;
    }
    
    if (selectedPegId && selectableSpaceIds.includes(spaceId)) {
      logDebug(`Selected space: ${spaceId}`);
      
      // Get the board space and check if it contains opponent pegs (for joker card)
      const space = gameState?.board.allSpaces.get(spaceId);
      const selectedCard = gameState?.players[gameState?.currentPlayerIndex]?.hand.find(card => card.id === selectedCardId);
      
      if (selectedCard) {
        logDebug(`Card: ${selectedCard.rank} of ${selectedCard.suit}`);
      } else {
        logDebug(`No card selected`);
      }
      
      if (space) {
        logDebug(`Space has ${space.pegs.length} pegs: ${space.pegs.join(', ')}`);
      } else {
        logDebug(`Space not found`);
      }
      
      if (selectedCard?.rank === 'joker' && space) {
        logDebug(`Joker card: clicked on space ${spaceId} with pegs: ${space.pegs.join(', ')}`);
        
        // Build the move
        const moves = getPossibleMoves(gameState, gameState?.players[gameState?.currentPlayerIndex]?.id, selectedCardId || '');
        logDebug(`Found ${moves.length} possible moves for player`);
        
        // Log all possible joker moves for debugging
        moves.forEach((move, idx) => {
          logDebug(`Move ${idx + 1}: Peg ${move.pegId} to ${move.destinations.join(', ')} with metadata: ${JSON.stringify(move.metadata || {})}`);
        });
        
        const jokerMove = moves.find(move => 
          move.pegId === selectedPegId && 
          move.destinations.includes(spaceId)
        );
        
        if (jokerMove) {
          logDebug(`Found joker move: ${JSON.stringify(jokerMove)}`);
          // Apply the joker move
          const { newState, bumpMessage } = applyMove(gameState, jokerMove);
          if (bumpMessage) {
            logDebug(`Bump message: ${bumpMessage}`);
          }
          
          setGameState(newState);
          setBumpMessage(bumpMessage);
          
          // Reset selection state
          setSelectedPegId(null);
          setSelectedCardId('');
          setSelectableSpaceIds([]);
          setSelectablePegIds([]);
          setPromptMessage('');
          
          // Check if game is over after move
          if (isGameOver(newState)) {
            setGameState({
              ...newState,
              phase: 'gameOver'
            });
            return;
          }
          
          // End the player's turn
          handleEndTurn(newState);
          return;
        } else {
          logDebug(`Error: Couldn't find the joker move in possible moves for peg ${selectedPegId} to space ${spaceId}`);
        }
      }
      
      // Regular move handling...
      const move = {
        playerId: gameState?.players[gameState?.currentPlayerIndex]?.id,
        cardId: selectedCardId || '', // Ensure non-null value
        pegId: selectedPegId,
        from: '',
        destinations: [spaceId]
      };
      
      // Apply the move
      logDebug("Applying move");
      const { newState, bumpMessage } = applyMove(gameState, move);
      
      if (bumpMessage) {
        logDebug(`Bump occurred: ${bumpMessage}`);
      }
      
      setGameState(newState);
      setBumpMessage(bumpMessage);
      
      // Reset selection state
      setSelectedPegId(null);
      setSelectedCardId('');
      setSelectableSpaceIds([]);
      setSelectablePegIds([]);
      setPromptMessage('');
      
      // Check if game is over after move
      if (isGameOver(newState)) {
        setGameState({
          ...newState,
          phase: 'gameOver'
        });
        return;
      }
      
      // End the player's turn
      handleEndTurn(newState);
    } else {
      logDebug(`Invalid space selection: ${spaceId} - either no peg selected or space not selectable`);
    }
  };
  
  // Handle end turn
  const handleEndTurn = (currentState: GameState = gameState) => {
    // If in preserve play mode, reset the turn state but don't advance to next player
    let nextState;
    if (devMode && preservePlayMode) {
      nextState = { ...currentState };
    } else {
      nextState = advanceToNextPlayer(currentState);
    }
    
    setGameState(nextState);
    setSelectedCardId(null);
    setSelectedPegId(null);
    setSelectableSpaceIds([]);
    setSelectablePegIds([]);
    setPromptMessage('');
    setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
    setSevenCardState({ state: 'INITIAL', isSplit: false });
    // Clear bump message after a delay
    setTimeout(() => setBumpMessage(undefined), 3000);
  };
  
  // Add this function to handle discarding and redrawing
  const handleDiscardAndRedraw = () => {
    const newState = { ...gameState };
    const player = newState.players[newState.currentPlayerIndex];
    
    // Add current hand to discard pile
    newState.discardPile.push(...player.hand);
    player.hand = [];
    
    // Draw 5 new cards
    for (let i = 0; i < 5; i++) {
      if (newState.drawPile.length > 0) {
        player.hand.push(newState.drawPile.pop()!);
      } else if (newState.discardPile.length > 0) {
        // If draw pile is empty, shuffle discard pile and use it
        newState.drawPile = [...newState.discardPile].sort(() => Math.random() - 0.5);
        newState.discardPile = [];
        if (newState.drawPile.length > 0) {
          player.hand.push(newState.drawPile.pop()!);
        }
      }
    }
    
    // Advance to next player
    const nextState = advanceToNextPlayer(newState);
    setGameState(nextState);
    
    // Reset turn state
    setSelectedCardId(null);
    setSelectedPegId(null);
    setSelectableSpaceIds([]);
    setSelectablePegIds([]);
    setPromptMessage('');
  };
  
  // Function to shuffle the current player's hand (dev mode)
  const handleShuffleHand = () => {
    const newState = { ...gameState };
    const player = newState.players[newState.currentPlayerIndex];
    
    // Add current hand to discard pile
    newState.discardPile.push(...player.hand);
    player.hand = [];
    
    // Draw 5 new cards
    for (let i = 0; i < 5; i++) {
      if (newState.drawPile.length > 0) {
        player.hand.push(newState.drawPile.pop()!);
      } else if (newState.discardPile.length > 0) {
        // If draw pile is empty, shuffle discard pile and use it
        newState.drawPile = [...newState.discardPile].sort(() => Math.random() - 0.5);
        newState.discardPile = [];
        if (newState.drawPile.length > 0) {
          player.hand.push(newState.drawPile.pop()!);
        }
      }
    }
    
    setGameState(newState);
    setSelectedCardId(null);
  };
  
  // Add zoom handling functions
  const handleZoomIn = () => {
    setZoomLevel(prevZoom => Math.min(prevZoom + 0.1, 2));
  };

  const handleZoomOut = () => {
    setZoomLevel(prevZoom => Math.max(prevZoom - 0.1, 0.5));
  };
  
  // Render welcome/shuffle phase
  const renderWelcomePhase = () => {
    return (
      <div className="welcome-overlay">
        {/* Animated background elements */}
        {floatingElements.map(element => (
          <div
            key={element.id}
            className={`floating-element ${element.type}`}
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              transform: `rotate(${element.rotation}deg) scale(${element.scale})`,
              backgroundColor: element.type === 'peg' ? element.color : undefined
            }}
          />
        ))}
        
        <div className="welcome-modal">
          <h1>Welcome to Joker Pursuit!</h1>
          <p>Start by shuffling the cards to begin the game.</p>
          
          {isShuffling ? (
            <div className="shuffle-animation-container shuffling">
              <div className="card-deck"></div>
              <div className="card"></div>
              <div className="card"></div>
              <div className="card"></div>
              <div className="card"></div>
            </div>
          ) : (
            <button 
              className="shuffle-button"
              onClick={handleShuffleAndDeal}
            >
              <span className="button-text">Shuffle Cards</span>
              <div className="button-shine"></div>
            </button>
          )}
        </div>
      </div>
    );
  };
  
  // If in welcome phase, show welcome screen
  if (gameState?.phase === 'welcome') {
    return renderWelcomePhase();
  }
  
  // Add a new function to handle skipping the second move
  const handleSkipSecondMove = () => {
    Log('Player chose to skip the second move of 9 card split');
    
    // Make sure the card gets discarded since we're ending the turn
    const currentPlayer = gameState?.players[gameState?.currentPlayerIndex];
    const selectedCard = currentPlayer?.hand.find(c => c.id === selectedCardId);
    
    if (selectedCard) {
      Log(`Discarding card ${selectedCard.rank} of ${selectedCard.suit} since second move is being skipped`);
      
      // Create an updated game state with the card discarded
      const updatedPlayers = [...gameState.players];
      const playerIndex = gameState.currentPlayerIndex;
      
      // Remove the card from the player's hand
      updatedPlayers[playerIndex] = {
        ...updatedPlayers[playerIndex],
        hand: updatedPlayers[playerIndex].hand.filter(c => c.id !== selectedCardId)
      };
      
      // Add the card to the discard pile
      const newState = {
        ...gameState,
        players: updatedPlayers,
        discardPile: [...gameState.discardPile, selectedCard]
      };
      
      // Update game state
      setGameState(newState);
    }
    
    // Reset all state
    setSelectedPegId(null);
    setSelectedCardId('');
    setSelectableSpaceIds([]);
    setSelectablePegIds([]);
    setPromptMessage('Second move skipped.');
    
    // Reset nine card state
    setNineCardState({ state: 'INITIAL', firstMoveComplete: false });
    
    // End the player's turn
    Log('Ending turn after skipping second move of 9 card split');
    handleEndTurn(gameState);
  };
  
  return (
    <div className="game-container">
      {/* Dev mode toggle */}
      <div className="dev-mode-container">
        <label className="dev-switch">
          <input 
            type="checkbox" 
            checked={devMode} 
            onChange={() => setDevMode(!devMode)} 
          />
          <span className="dev-slider"></span>
          <span className="dev-label">Dev Mode</span>
        </label>
      </div>
      
      {/* Dev mode controls */}
      {devMode && gameState.phase === 'playing' && (
        <>
          <div className="shuffle-hand-container">
            <button
              className="shuffle-hand-button"
              onClick={handleShuffleHand}
            >
              Shuffle Hand
            </button>
          </div>
          
          <div className="preserve-play-container">
            <button
              className={`preserve-play-button ${preservePlayMode ? 'active' : ''}`}
              onClick={() => {
                const newMode = !preservePlayMode;
                setPreservePlayMode(newMode);
                
                if (newMode) {
                  setPromptMessage('Preserve Play Mode: Current player turn will be preserved when playing cards.');
                } else {
                  setPromptMessage('Resumed normal turn advancement.');
                }
              }}
            >
              {preservePlayMode ? 'Resume Turns' : 'Preserve Play'}
            </button>
          </div>
          
          <div className="move-pegs-container">
            <button
              className={`move-pegs-button ${movePegsMode ? 'active' : ''}`}
              onClick={() => {
                // Toggle move pegs mode
                const newMode = !movePegsMode;
                setMovePegsMode(newMode);
                
                // If enabling move pegs mode, make all pegs selectable
                if (newMode) {
                  // Collect all peg IDs on the board
                  const allPegIds: string[] = [];
                  
                  // Loop through all spaces and collect their pegs
                  for (const space of Array.from(gameState.board.allSpaces.values())) {
                    if (space.pegs.length > 0) {
                      allPegIds.push(...space.pegs);
                    }
                  }
                  
                  // Set all pegs as selectable
                  setSelectablePegIds(allPegIds);
                  setPromptMessage('Move Pegs Mode: Select any peg to move it.');
                } else {
                  // If disabling, clear selectable pegs
                  setSelectablePegIds([]);
                  setSelectableSpaceIds([]);
                  setSelectedPegId(null);
                  setPromptMessage('Exited Move Pegs Mode.');
                }
              }}
            >
              {movePegsMode ? 'Exit Move Pegs' : 'Move Pegs'}
            </button>
          </div>
        </>
      )}
      
      <div className="game-board-container">
        {(promptMessage || bumpMessage) && (
          <div className="prompt-message">
            {promptMessage && <div>{promptMessage}</div>}
            {bumpMessage && <div className="bump-message">{bumpMessage}</div>}
            
            {/* Castle Entry prompt */}
            {castlePromptState.isActive && (
              <div className="castle-choice-controls">
                <button 
                  className="castle-choice-button enter"
                  onClick={() => handleCastleChoice(true)}
                >
                  Yes, enter castle
                </button>
                <button 
                  className="castle-choice-button continue"
                  onClick={() => handleCastleChoice(false)}
                >
                  No, continue on board
                </button>
              </div>
            )}
            
            {/* Skip Second Move Button for 9 card when no valid moves */}
            {nineCardState.state === 'NO_VALID_SECOND_MOVES' && (
              <div className="skip-second-move">
                <p>No valid moves are available for the second part of your 9 card split.</p>
                <button onClick={handleSkipSecondMove}>Skip Second Move & End Turn</button>
              </div>
            )}
            
            {selectedCardId && gameState?.players[gameState?.currentPlayerIndex]?.hand.find(c => c.id === selectedCardId)?.rank === '9' && (
              <div className="nine-card-controls">
                {/* Initial option selection: Move 9 or Split 9 */}
                {nineCardState.state === 'INITIAL' && !nineCardState.splitSelected && (
                  <>
                    <button onClick={() => handleNineCardOption('move')}>Move 9: move 1 peg forward 9</button>
                    <button onClick={() => handleNineCardOption('split')}>Split 9: 2 pegs, 1 moves forward, 1 moves backward, total movement adds up to 9</button>
                  </>
                )}
                
                {/* Direction selection for split move */}
                {nineCardState.state === 'INITIAL' && nineCardState.splitSelected && (
                  <>
                    <button onClick={() => handleNineCardDirection('forward')}>Forward First</button>
                    <button onClick={() => handleNineCardDirection('backward')}>Backward First</button>
                  </>
                )}
                
                {/* Steps selection after direction is chosen */}
                {nineCardState.state === 'DIRECTION_SELECTED' && (
                  <div className="steps-input">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                      <button 
                        key={num}
                        onClick={() => handleNineCardSteps(num)}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedCardId && gameState?.players[gameState?.currentPlayerIndex]?.hand.find(c => c.id === selectedCardId)?.rank === '7' && (
              <div className="seven-card-controls">
                {!sevenCardState.isSplit && !sevenCardState.firstMoveSteps && (
                  <>
                    <button onClick={() => handleSevenCardOption('move')}>Move 1 peg forward 7</button>
                    <button onClick={() => handleSevenCardOption('split')}>Split between 2 pegs</button>
                  </>
                )}
                {sevenCardState.isSplit && !sevenCardState.firstMoveSteps && (
                  <div className="steps-input">
                    {[1, 2, 3, 4, 5, 6].map(num => (
                      <button 
                        key={num}
                        onClick={() => handleSevenCardSteps(num)}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="board-area">
          <div className="board-container-wrapper">
            <Board 
              board={gameState?.board}
              onSpaceClick={handleSpaceSelect}
              onPegSelect={handlePegSelect}
              selectedPegId={selectedPegId}
              currentPlayerId={gameState?.players[gameState?.currentPlayerIndex]?.id}
              selectableSpaceIds={selectableSpaceIds}
              selectablePegIds={selectablePegIds}
              playerColors={playerColors}
              zoomLevel={zoomLevel}
            />
          </div>
        </div>
        
        <div className="bottom-panel">
          <div 
            className="player-turn-indicator"
            style={{ 
              color: playerColors[gameState?.players[gameState?.currentPlayerIndex]?.id],
              textShadow: `0 2px 4px rgba(0, 0, 0, 0.5), 0 0 10px ${playerColors[gameState?.players[gameState?.currentPlayerIndex]?.id]}` 
            }}
          >
            {gameState?.players[gameState?.currentPlayerIndex]?.name}'s Turn
          </div>
          
          <div className="controls-container">
            <CardHand 
              cards={gameState?.players[gameState?.currentPlayerIndex]?.hand}
              selectedCardId={selectedCardId}
              onCardSelect={handleCardSelect}
            />
            
            <div className="zoom-controls">
              <button className="zoom-button" onClick={handleZoomIn}>+</button>
              <div className="zoom-level">{Math.round(zoomLevel * 100)}%</div>
              <button className="zoom-button" onClick={handleZoomOut}>−</button>
            </div>
          </div>
          
          <div className="turn-controls">
            {canUseDiscardButton(gameState, gameState?.players[gameState?.currentPlayerIndex]) && (
              <button 
                className="discard-hand-button"
                onClick={handleDiscardAndRedraw}
              >
                Discard Hand & Draw New Cards
              </button>
            )}
          </div>
        </div>
        
        {gameState?.phase === 'gameOver' && (
          <div className="game-over-overlay">
            <div className="game-over-modal">
              <h2>Game Over!</h2>
              <p>Team {gameState.winner?.teamId} wins!</p>
              <button onClick={() => window.location.reload()}>
                Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameController; 