// Firebase Configuration
const firebaseConfig = {
    apiKey: "FIREBASE_API_KEY_PLACEHOLDER",
    authDomain: "FIREBASE_AUTH_DOMAIN_PLACEHOLDER",
    databaseURL: "FIREBASE_DATABASE_URL_PLACEHOLDER",
    projectId: "FIREBASE_PROJECT_ID_PLACEHOLDER",
    storageBucket: "FIREBASE_STORAGE_BUCKET_PLACEHOLDER",
    messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID_PLACEHOLDER",
    appId: "FIREBASE_APP_ID_PLACEHOLDER",
    measurementId: "FIREBASE_MEASUREMENT_ID_PLACEHOLDER"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
const analytics = firebase.analytics();

// Game elements
const svg = document.getElementById('main-svg');
const gridContainer = document.getElementById('grid-container');
const input = document.getElementById('connection-input');
const gameWindow = document.getElementById('game-window');
const turnIndicator = document.getElementById('turn-indicator');
const scoreDisplay = document.getElementById('score-display');
const startGameButton = document.getElementById('start-game-button');
const gridSizeSelect = document.getElementById('grid-size-select');

// Create groups for lines
const lineGroup = document.getElementById('line-group');
let usingFreeBlock = false;
let lastTurnConceded = false;

// Track the currently selected grid cell
let selectedCell = null;

// Track filled cells and their data
const filledCells = new Map();

// Store CSV data
let gameCsvData = [];

// Track the current topic block
let currentTopicArticle = null;
let currentTopicCell = null;

// Multiplayer state
let currentUser = null;
let gameId = null;
let playerNumber = null;
let gameRef = null;
let gameStarted = false;
let gridSize = parseInt(gridSizeSelect.value); // Default grid size

// Function to generate a random game ID
function generateGameId() {
    return Math.random().toString(36).substr(2, 9);
}

// Function to show a popup message
function showPopup(message, additionalContent = '') {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <p>${message}</p>
        ${additionalContent}
        <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">Close</button>
    `;
    popup.querySelector('button').addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
    return popup;
}

// Function to show the initial game start popup
function showInitialPopup() {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <p style="font-weight: bold; font-size: 18px; margin-bottom: 15px;">Welcome to Deep Knowledge Trivia - Mode 2</p>
        <p>Choose an option to begin:</p>
        <button id="start-new-game-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 10px;">Start New Game</button>
        <button id="join-game-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 10px;">Join Game</button>
        <button id="how-to-play-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 10px;">How to Play</button>
        <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">Close</button>
    `;
    const startNewGameButton = popup.querySelector('#start-new-game-button');
    const joinGameButton = popup.querySelector('#join-game-button');
    const howToPlayButton = popup.querySelector('#how-to-play-button');
    const closeButton = popup.querySelector('button:last-child');

    // Start New Game
    startNewGameButton.addEventListener('click', () => {
        startNewGame();
        popup.remove();
    });

    // Join Game
    joinGameButton.addEventListener('click', () => {
        popup.remove();
        showJoinGamePopup();
    });

    // How to Play
    howToPlayButton.addEventListener('click', () => {
        popup.remove();
        showPopup(
            'How to Play Territory 1 v 1',
            `
            <p style="text-align: left; margin-bottom: 20px;">
                1. Share the game link with a friend to start a multiplayer game.<br>
                2. Take turns placing blocks on the grid by connecting Wikipedia articles.<br>
                3. Each block must be placed adjacent to the current topic block.<br>
                4. Use the "Free Block" option to place a block anywhere (once per game).<br>
                5. Concede a turn if you can't make a move, but two consecutive concessions end the game.<br>
                6. Capture opponent cells by surrounding them to gain more territory.<br>
                7. The game ends when the grid is full or after two consecutive concessions.<br>
                8. The player with the most cells wins!<br>
            </p>
            `
        );
    });

    // Close
    closeButton.addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
}

// Function to show the join game popup
function showJoinGamePopup() {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <p style="font-weight: bold; font-size: 18px; margin-bottom: 15px;">Join a Game</p>
        <div style="text-align: left; padding: 0 20px;">
            <label for="game-id-input">Game ID:</label><br>
            <input type="text" id="game-id-input" style="width: 100%; margin-bottom: 15px; padding: 5px;" placeholder="Enter Game ID"><br>
        </div>
        <button id="submit-join-game-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-bottom: 10px;">Join Game</button>
        <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
    `;
    popup.querySelector('#submit-join-game-button').addEventListener('click', () => {
        const gameIdInput = popup.querySelector('#game-id-input').value.trim();
        if (!gameIdInput) {
            showPopup('Please enter a Game ID.');
            return;
        }
        joinGame(gameIdInput);
        popup.remove();
    });
    popup.querySelector('button:last-child').addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
}

// Function to show the sharable link popup
function showShareLinkPopup(gameId) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`;
    showPopup('Share this link with your friend to start the game:', `
        <input type="text" id="share-link" value="${shareUrl}" readonly>
    `);
}

// Function to generate the grid dynamically
function generateGrid() {
    gridContainer.innerHTML = '';
    const cellSize = 510 / gridSize;
    gridContainer.style.gridTemplateColumns = `repeat(${gridSize}, ${cellSize}px)`;
    gridContainer.style.gridTemplateRows = `repeat(${gridSize}, ${cellSize}px)`;

    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.style.width = `${cellSize}px`;
            cell.style.height = `${cellSize}px`;
            cell.addEventListener('click', () => {
                if (filledCells.has(cell)) {
                    currentTopicCell = cell;
                    currentTopicArticle = filledCells.get(cell).article;
                    displayGameWindow(filledCells.get(cell));
                } else if (!selectedCell && !input.disabled && !filledCells.has(cell)) {
                    if (selectedCell) {
                        selectedCell.classList.remove('selected');
                    }
                    cell.classList.add('selected');
                    selectedCell = cell;
                }
            });
            gridContainer.appendChild(cell);
        }
    }
}

// Function to draw connection lines
function drawConnectionLine(fromCell, toCell) {
    const fromNode = fromCell.querySelector('.connection-node');
    const toNode = toCell.querySelector('.connection-node');
    if (!fromNode || !toNode) {
        console.error('Connection nodes not found for cells:', fromCell, toCell);
        return;
    }

    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();

    const x1 = fromRect.left + fromRect.width / 2 - svgRect.left;
    const y1 = fromRect.top + fromRect.height / 2 - svgRect.top;
    const x2 = toRect.left + toRect.width / 2 - svgRect.left;
    const y2 = toRect.top + toRect.height / 2 - svgRect.top;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#333333');
    line.setAttribute('stroke-width', '3');
    lineGroup.appendChild(line);
}

// Function to display game window
function displayGameWindow(data = null) {
    gameWindow.innerHTML = '';
    if (data) {
        const { title, imageUrl, views } = data;
        gameWindow.innerHTML = `
            <h3>${title || 'No Article Selected'}</h3>
            ${imageUrl ? `<img src="${imageUrl}" alt="${title}" style="max-width: 100%; height: auto; border-radius: 5px; margin-top: 10px;">` : ''}
            <p><strong>Views:</strong> ${views || 'N/A'}</p>
        `;
        const pointsContainer = document.createElement('div');
        pointsContainer.style.marginTop = '10px';

        const useFreeBlockButton = document.createElement('button');
        useFreeBlockButton.textContent = 'Use Free Block';
        useFreeBlockButton.style.backgroundColor = '#6273B4';
        useFreeBlockButton.style.color = '#fff';
        useFreeBlockButton.style.border = 'none';
        useFreeBlockButton.style.padding = '5px 10px';
        useFreeBlockButton.style.borderRadius = '5px';
        useFreeBlockButton.style.cursor = 'pointer';
        useFreeBlockButton.style.marginRight = '10px';
        useFreeBlockButton.addEventListener('click', () => {
            usingFreeBlock = true;
            showPopup('Free block activated! You can place your next block anywhere.');
        });
        pointsContainer.appendChild(useFreeBlockButton);

        const concedeTurnButton = document.createElement('button');
        concedeTurnButton.textContent = 'Concede Turn';
        concedeTurnButton.style.backgroundColor = '#FF4500';
        concedeTurnButton.style.color = '#fff';
        concedeTurnButton.style.border = 'none';
        concedeTurnButton.style.padding = '5px 10px';
        concedeTurnButton.style.borderRadius = '5px';
        concedeTurnButton.style.cursor = 'pointer';
        concedeTurnButton.addEventListener('click', () => {
            gameRef.once('value').then(snapshot => {
                const gameData = snapshot.val();
                const currentScores = gameData?.scores || { player1: { points: 0, cells: 0 }, player2: { points: 0, cells: 0 } };
                const currentTurn = gameData?.currentTurn || 'player1';

                const nextTurn = currentTurn === 'player1' ? 'player2' : 'player1';
                const updatedScores = { ...currentScores };
                updatedScores[nextTurn].points = (updatedScores[nextTurn].points || 0) + 1;

                let updates = {
                    currentTurn: nextTurn,
                    scores: updatedScores
                };

                if (lastTurnConceded) {
                    updates.status = 'finished';
                    const winner = updatedScores.player1.cells > updatedScores.player2.cells ? 'Player 1' : 
                                  updatedScores.player2.cells > updatedScores.player2.cells ? 'Player 2' : 'Tie';
                    showPopup(`Game Over! Winner: ${winner}`, `
                        <p>Player 1: ${updatedScores.player1.cells} cells</p>
                        <p>Player 2: ${updatedScores.player2.cells} cells</p>
                    `);
                }

                lastTurnConceded = true;

                gameRef.update(updates).catch(error => {
                    console.error('Error conceding turn:', error);
                    showPopup('Error conceding turn. Please try again.');
                });
            }).catch(error => {
                console.error('Error fetching game state for concede turn:', error);
                showPopup('Error conceding turn. Please try again.');
            });
        });
        pointsContainer.appendChild(concedeTurnButton);

        gameWindow.appendChild(pointsContainer);
    }
}

// Function to initialize a new game
function startNewGame() {
    gameId = generateGameId();
    playerNumber = 'player1';
    const gameData = {
        grid: {},
        currentTurn: null,
        players: {
            player1: currentUser.uid,
            player2: null
        },
        topicBlock: null,
        status: 'waiting',
        scores: {
            player1: { cells: 0, points: 0 },
            player2: { cells: 0, points: 0 }
        },
        round: 0,
        ratios: { player1: [], player2: [] },
        gridSize: gridSize
    };
    gameRef = database.ref(`territory_games/${gameId}`);
    gameRef.set(gameData).then(() => {
        showShareLinkPopup(gameId);
        listenForGameUpdates();
        startGameButton.style.display = 'none';
    }).catch((error) => {
        console.error('Error starting new game:', error);
        showPopup('Error starting new game. Please try again.');
    });
}

// Function to join an existing game
function joinGame(gameIdInput) {
    gameId = gameIdInput;
    gameRef = database.ref(`territory_games/${gameId}`);
    gameRef.once('value').then((snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) {
            showPopup('Game not found. Starting a new game.');
            startNewGame();
            return;
        }
        if (gameData.status !== 'waiting') {
            showPopup('Game already in progress or finished.');
            return;
        }
        gridSize = gameData.gridSize || 5;
        gridSizeSelect.value = gridSize;
        generateGrid();
        if (gameData.players.player1 === currentUser.uid) {
            playerNumber = 'player1';
            showShareLinkPopup(gameId);
        } else if (!gameData.players.player2) {
            playerNumber = 'player2';
            gameRef.update({
                'players/player2': currentUser.uid
            }).then(() => {
                listenForGameUpdates();
                startGameButton.style.display = 'none';
            }).catch((error) => {
                console.error('Error joining game:', error);
                showPopup('Error joining game. Please try again.');
            });
        } else {
            showPopup('Game is full.');
        }
    }).catch((error) => {
        console.error('Error checking game state:', error);
        showPopup('Error joining game. Please try again.');
    });
}

// Function to update the grid
function updateGrid(grid, round) {
    console.log('Updating grid with data:', grid);

    const cells = gridContainer.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        Array.from(cell.children).forEach(child => {
            if (!child.classList.contains('connection-node')) {
                cell.removeChild(child);
            }
        });
    });
    filledCells.clear();
    lineGroup.innerHTML = '';

    const gridData = grid || {};

    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const cell = gridContainer.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            const cellKey = `${row}_${col}`;
            const cellData = gridData[cellKey];
            if (cellData) {
                console.log(`Rendering cell ${cellKey} with player: ${cellData.player}`);
                cell.classList.remove('player1', 'player2');
                cell.classList.add('filled', cellData.player);
                if (!filledCells.has(cell)) {
                    let node = cell.querySelector('.connection-node');
                    if (!node) {
                        node = document.createElement('div');
                        node.classList.add('connection-node');
                        cell.appendChild(node);
                    }
                    filledCells.set(cell, {
                        article: cellData.article,
                        imageUrl: cellData.imageUrl,
                        views: cellData.views,
                        player: cellData.player,
                        node: node
                    });

                    if (cellData.connectionTo && round > 1) {
                        const [fromRow, fromCol] = cellData.connectionTo;
                        const fromCell = gridContainer.querySelector(`.grid-cell[data-row="${fromRow}"][data-col="${fromCol}"]`);
                        if (fromCell) {
                            console.log(`Drawing line from ${fromRow}_${fromCol} to ${row}_${col}`);
                            drawConnectionLine(fromCell, cell);
                        } else {
                            console.log(`Could not draw line: fromCell at ${fromRow}_${fromCol} not found`);
                        }
                    } else if (round <= 1) {
                        console.log(`Skipping line drawing for cell ${cellKey}: round ${round} <= 1`);
                    }
                }
            }
        }
    }
}

// Function to check if a cell is adjacent to another
function isAdjacentToCell(row, col, topicRow, topicCol) {
    return (
        (Math.abs(row - topicRow) === 1 && col === topicCol) ||
        (Math.abs(col - topicCol) === 1 && row === topicRow)
    );
}

// Function to update the turn indicator
function updateTurnIndicator(currentTurn, players) {
    if (currentTurn) {
        const isMyTurn = (currentTurn === 'player1' && players.player1 === currentUser.uid) ||
                         (currentTurn === 'player2' && players.player2 === currentUser.uid);
        turnIndicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
        turnIndicator.style.color = isMyTurn ? '#00FF00' : '#FF0000';
        input.disabled = !isMyTurn;
        input.style.backgroundColor = isMyTurn ? '#fff' : '#ccc';
    } else {
        turnIndicator.textContent = 'Waiting for opponent...';
        turnIndicator.style.color = '#FFFF00';
        input.disabled = true;
        input.style.backgroundColor = '#ccc';
    }
}

// Function to update the scores display
function updateScores(scores) {
    const player1Cells = scores.player1?.cells || 0;
    const player2Cells = scores.player2?.cells || 0;
    scoreDisplay.textContent = `Player 1: ${player1Cells} cells | Player 2: ${player2Cells} cells`;
}

// Function to fetch Wikipedia article title
async function getWikipediaArticleTitle(searchTerm) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&origin=*`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.query.search.length > 0) {
            const topResult = data.query.search[0].title;
            console.log(`Search "${searchTerm}" matched top result: "${topResult}"`);
            return topResult;
        }
        console.log(`No matching article found for "${searchTerm}"`);
        return null;
    } catch (error) {
        console.error(`Error fetching article title for "${searchTerm}":`, error);
        return null;
    }
}

// Function to fetch Wikipedia article thumbnail
async function fetchMainImage(articleTitle) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(articleTitle)}&prop=pageimages&piprop=thumbnail&pithumbsize=300&format=json&origin=*&redirects`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        if (pageId === '-1' || !pages[pageId].thumbnail) {
            console.log(`No thumbnail available for "${articleTitle}"`);
            return null;
        }
        return pages[pageId].thumbnail.source;
    } catch (error) {
        console.error(`Error fetching image for "${articleTitle}":`, error);
        return null;
    }
}

// Function to fetch average monthly views
async function fetchAverageMonthlyViews(articleTitle) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30);
    const start = startDate.toISOString().slice(0, 10).replace(/-/g, '');
    const end = endDate.toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(articleTitle)}/daily/${start}/${end}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.items && data.items.length > 0) {
            const totalViews = data.items.reduce((sum, item) => sum + item.views, 0);
            const days = data.items.length;
            const averageDailyViews = totalViews / days;
            const averageMonthlyViews = Math.round(averageDailyViews * 30.42);
            return { formatted: averageMonthlyViews.toLocaleString(), raw: averageMonthlyViews };
        }
        return { formatted: 'N/A', raw: 0 };
    } catch (error) {
        console.error(`Error fetching views for "${articleTitle}":`, error);
        return { formatted: 'N/A', raw: 0 };
    }
}

// Function to check wikitext for links
async function checkWikitextForLink(subjectTitle, topicTitle) {
    const subjectUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(subjectTitle)}&prop=wikitext&format=json&origin=*`;
    const topicUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(topicTitle)}&prop=wikitext&format=json&origin=*`;
    let hyperlinks = [];

    async function extractHyperlinks(wikitext, articleTitle) {
        const refIndex = wikitext.search(/==\s*References\s*==|==\s*See also\s*==|<references\s*\/>|{{Reflist}}/i);
        const relevantText = refIndex === -1 ? wikitext : wikitext.substring(0, refIndex);
        const linkPattern = /\[\[([^\]\|]+)(?:\|[^\]]*)*\]\]/g;
        let match;
        const links = new Set();
        while ((match = linkPattern.exec(relevantText)) !== null) {
            let link = match[1].trim();
            const hashIndex = link.indexOf('#');
            if (hashIndex !== -1) {
                link = link.substring(0, hashIndex);
            }
            if (link) {
                links.add(link);
                hyperlinks.push({ article: articleTitle, hyperlink: link });
            }
        }
        return Array.from(links);
    }

    try {
        let subjectLinks = [];
        const subjectResponse = await fetch(subjectUrl);
        const subjectData = await subjectResponse.json();
        if (!subjectData.error) {
            const subjectWikitext = subjectData.parse.wikitext['*'];
            subjectLinks = await extractHyperlinks(subjectWikitext, subjectTitle);
        } else {
            console.error('Subject API error:', subjectData.error);
        }

        let topicLinks = [];
        const topicResponse = await fetch(topicUrl);
        const topicData = await topicResponse.json();
        if (!topicData.error) {
            const topicWikitext = topicData.parse.wikitext['*'];
            topicLinks = await extractHyperlinks(topicWikitext, topicTitle);
        } else {
            console.error('Topic API error:', topicData.error);
        }

        return subjectLinks.includes(topicTitle) || topicLinks.includes(subjectTitle);
    } catch (error) {
        console.error('Error checking wikitext:', error);
        return false;
    }
}

// Function to generate CSV content
function generateCsvContent() {
    let csv = 'Article,Ratio,Points Earned,Views\n';
    gameCsvData.forEach(row => {
        csv += `"${row.article.replace(/"/g, '""')}","${row.ratio}","${row.pointsEarned}","${row.views}"\n`;
    });
    return csv;
}

// Function to listen for game updates
function listenForGameUpdates() {
    let joinPopup = null;

    gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) {
            console.log('No game data received from Firebase');
            return;
        }

        console.log('Received Firebase update:', gameData);

        gridSize = gameData.gridSize || 5;
        gridSizeSelect.value = gridSize;
        generateGrid();

        updateTurnIndicator(gameData.currentTurn, gameData.players);
        updateScores(gameData.scores);

        const grid = gameData.grid || {};
        const round = gameData.round || 0;
        try {
            console.log('Calling updateGrid with grid:', grid);
            updateGrid(grid, round);
        } catch (error) {
            console.error('Error updating grid:', error);
        }

        if (gameData.topicBlock) {
            const { row, col, article } = gameData.topicBlock;
            currentTopicArticle = article;
            currentTopicCell = gridContainer.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            const cellData = filledCells.get(currentTopicCell);
            if (cellData) {
                console.log(`Updating info window for cell ${row}_${col}:`, cellData);
                displayGameWindow({
                    title: cellData.article,
                    imageUrl: cellData.imageUrl,
                    views: cellData.views.formatted
                });
            } else {
                console.log(`No cell data found for topic block at ${row}_${col}`);
            }
        } else {
            currentTopicArticle = null;
            currentTopicCell = null;
            displayGameWindow();
        }

        if (gameData.players.player1 && gameData.players.player2 && gameData.status === 'waiting' && !gameStarted) {
            joinPopup = showPopup('Two players have joined!', `
                <button id="begin-game-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">Start Game</button>
            `);
            document.getElementById('begin-game-button').addEventListener('click', () => {
                gameRef.update({
                    status: 'active',
                    currentTurn: Math.random() < 0.5 ? 'player1' : 'player2'
                }).then(() => {
                    gameStarted = true;
                    showPopup('Game started!');
                    input.disabled = false;
                }).catch((error) => {
                    console.error('Error starting game:', error);
                    showPopup('Error starting game. Please try again.');
                });
            });
        }

        if (gameData.status === 'active' && joinPopup) {
            joinPopup.remove();
            joinPopup = null;
        }

        if (gameData.status === 'finished') {
            gameRef.off();
        }
    }, (error) => {
        console.error('Error listening for game updates:', error);
        showPopup('Error loading game updates. Please try again.');
    });
}

// Handle text input
input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim() !== '') {
        const userInput = input.value.trim();
        console.log(`User entered: ${userInput}`);

        if (!selectedCell) {
            showPopup('Please select a grid location.');
            input.value = '';
            return;
        }

        const articleTitle = await getWikipediaArticleTitle(userInput);
        if (!articleTitle) {
            showPopup('No matching Wikipedia article found. Try again.');
            input.value = '';
            if (selectedCell) {
                selectedCell.classList.remove('selected');
                selectedCell = null;
            }
            return;
        }

        let baseRatio = 0;
        let round = 0;
        let currentGrid = null;
        let scores = null;
        let currentTurn = null;

        const snapshot = await gameRef.once('value');
        const gameData = snapshot.val() || { 
            scores: { 
                player1: { cells: 0, points: 0 }, 
                player2: { cells: 0, points: 0 }
            }, 
            grid: {},
            round: 0,
            ratios: { player1: [], player2: [] }
        };

        currentGrid = gameData.grid || {};
        round = gameData.round || 0;
        scores = gameData.scores || { player1: { cells: 0, points: 0 }, player2: { cells: 0, points: 0 } };
        currentTurn = gameData.currentTurn || 'player1';
        playerNumber = currentTurn;
        console.log(`Current turn: ${currentTurn}, Player number: ${playerNumber}`);

        let canPlaceAnywhere = usingFreeBlock;

        const row = parseInt(selectedCell.dataset.row);
        const col = parseInt(selectedCell.dataset.col);
        if (!canPlaceAnywhere && round > 1) {
            if (!currentTopicCell) {
                showPopup('No topic block selected. Click a filled block to set the topic.');
                input.value = '';
                if (selectedCell) {
                    selectedCell.classList.remove('selected');
                    selectedCell = null;
                }
                return;
            }

            const topicRow = parseInt(currentTopicCell.dataset.row);
            const topicCol = parseInt(currentTopicCell.dataset.col);

            if (!isAdjacentToCell(row, col, topicRow, topicCol)) {
                showPopup('Selected cell must be adjacent to the topic block.');
                input.value = '';
                if (selectedCell) {
                    selectedCell.classList.remove('selected');
                    selectedCell = null;
                }
                return;
            }

            const hasLink = await checkWikitextForLink(articleTitle, currentTopicArticle);
            if (!hasLink) {
                showPopup('Input does not match. Try again.');
                input.value = '';
                if (selectedCell) {
                    selectedCell.classList.remove('selected');
                    selectedCell = null;
                }
                return;
            }

            const newViewsData = await fetchAverageMonthlyViews(articleTitle);
            const topicCell = Array.from(filledCells.entries()).find(([_, data]) => data.article === currentTopicArticle);
            const topicViews = topicCell ? topicCell[1].views.raw : 0;
            if (newViewsData.raw !== 0 && topicViews !== 0) {
                baseRatio = newViewsData.raw / topicViews;
                console.log(`Base Ratio for ${articleTitle}/${currentTopicArticle}: ${baseRatio}`);
            } else {
                baseRatio = 0;
                console.log(`No valid views data for ${articleTitle} or ${currentTopicArticle}, ratio set to 0`);
            }
        } else {
            baseRatio = 1;
            console.log(`First block ratio set to 1 for ${articleTitle}`);
        }

        if (usingFreeBlock) {
            usingFreeBlock = false;
        }

        const cellKey = `${row}_${col}`;
        currentGrid[cellKey] = {
            article: articleTitle,
            imageUrl: await fetchMainImage(articleTitle),
            views: await fetchAverageMonthlyViews(articleTitle),
            player: playerNumber,
            connectionTo: currentTopicCell && !canPlaceAnywhere && round > 1 ? [parseInt(currentTopicCell.dataset.row), parseInt(currentTopicCell.dataset.col)] : null
        };

        scores[playerNumber].cells = (scores[playerNumber].cells || 0) + 1;

        let updates = {
            grid: currentGrid,
            currentTurn: playerNumber === 'player1' ? 'player2' : 'player1',
            scores: scores,
            topicBlock: {
                row: row,
                col: col,
                article: articleTitle
            },
            round: round + 1
        };

        let ratios = gameData.ratios || { player1: [], player2: [] };
        if (!ratios.player1) ratios.player1 = [];
        if (!ratios.player2) ratios.player2 = [];

        if (round % 2 === 1 && round > 0) {
            ratios[playerNumber].push(baseRatio);
            updates.ratios = ratios;

            const p1Ratio = ratios.player1[ratios.player1.length - 1];
            const p2Ratio = ratios.player2[ratios.player2.length - 1];
            if (p1Ratio < p2Ratio) {
                scores.player1.points = (scores.player1.points || 0) + 1;
                showPopup('Player 1 wins this round with a lower ratio!');
            } else if (p2Ratio < p1Ratio) {
                scores.player2.points = (scores.player2.points || 0) + 1;
                showPopup('Player 2 wins this round with a lower ratio!');
            } else {
                showPopup('Tie round - no points awarded.');
            }
            updates.scores = scores;
        } else {
            ratios[playerNumber].push(baseRatio);
            updates.ratios = ratios;
        }

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const key = `${r}_${c}`;
                const cell = currentGrid[key];
                if (cell && cell.player !== playerNumber) {
                    const surrounded = [
                        { dr: -1, dc: 0 },
                        { dr: 1, dc: 0 },
                        { dr: 0, dc: -1 },
                        { dr: 0, dc: 1 }
                    ].every(({ dr, dc }) => {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) return true;
                        const neighborKey = `${nr}_${nc}`;
                        const neighbor = currentGrid[neighborKey];
                        return neighbor && neighbor.player === playerNumber;
                    });

                    if (surrounded) {
                        console.log(`Cell at ${r}_${c} surrounded by ${playerNumber}, changing ownership`);
                        currentGrid[key].player = playerNumber;
                        scores[playerNumber].cells = (scores[playerNumber].cells || 0) + 1;
                        scores[cell.player].cells = (scores[cell.player].cells || 0) - 1;
                        updates.grid = currentGrid;
                        updates.scores = scores;
                    }
                }
            }
        }

        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const key = `${r}_${c}`;
                const cell = currentGrid[key];
                if (cell) {
                    const currentOwner = cell.player;
                    const opposingPlayer = currentOwner === 'player1' ? 'player2' : 'player1';

                    const directions = [
                        { dr: -1, dc: 0 },
                        { dr: 1, dc: 0 },
                        { dr: 0, dc: -1 },
                        { dr: 0, dc: 1 }
                    ];

                    let maxSurrounding = 0;
                    let opposingCount = 0;
                    directions.forEach(({ dr, dc }) => {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
                            maxSurrounding++;
                            const neighborKey = `${nr}_${nc}`;
                            const neighbor = currentGrid[neighborKey];
                            if (neighbor && neighbor.player === opposingPlayer) {
                                opposingCount++;
                            }
                        }
                    });

                    let captureThreshold;
                    if (maxSurrounding === 4) {
                        captureThreshold = 3;
                    } else if (maxSurrounding === 3) {
                        captureThreshold = 2;
                    } else if (maxSurrounding === 2) {
                        captureThreshold = 2;
                    } else {
                        continue;
                    }

                    if (opposingCount >= captureThreshold) {
                        console.log(`Cell at ${r}_${c} captured by ${opposingPlayer}: ${opposingCount}/${maxSurrounding} surrounding cells`);
                        currentGrid[key].player = opposingPlayer;
                        scores[opposingPlayer].cells = (scores[opposingPlayer].cells || 0) + 1;
                        scores[currentOwner].cells = (scores[currentOwner].cells || 0) - 1;
                        updates.grid = currentGrid;
                        updates.scores = scores;
                    }
                }
            }
        }

        let filledCellsCount = Object.keys(currentGrid).length;
        if (filledCellsCount >= gridSize * gridSize) {
            updates.status = 'finished';
        }

        lastTurnConceded = false;

        await gameRef.update(updates);

        gameCsvData.push({
            article: articleTitle,
            ratio: baseRatio,
            pointsEarned: 0,
            views: (await fetchAverageMonthlyViews(articleTitle)).formatted
        });
        console.log('Updated CSV:', generateCsvContent());

        selectedCell.classList.remove('selected');
        selectedCell.classList.add('filled', playerNumber);
        const node = document.createElement('div');
        node.classList.add('connection-node');
        selectedCell.appendChild(node);
        filledCells.set(selectedCell, {
            article: articleTitle,
            imageUrl: await fetchMainImage(articleTitle),
            views: await fetchAverageMonthlyViews(articleTitle),
            player: playerNumber,
            node: node
        });

        await new Promise(resolve => setTimeout(resolve, 0));

        if (currentTopicCell && round > 1) {
            const fromRow = parseInt(currentTopicCell.dataset.row);
            const fromCol = parseInt(currentTopicCell.dataset.col);
            const toRow = parseInt(selectedCell.dataset.row);
            const toCol = parseInt(selectedCell.dataset.col);
            if (fromRow === toRow && fromCol === toCol) {
                console.error(`Error: Topic cell (${fromRow}, ${fromCol}) is the same as new cell (${toRow}, ${toCol}). Skipping line drawing.`);
            } else {
                console.log(`Drawing line from topic cell (${fromRow}, ${fromCol}) to new cell (${toRow}, ${toCol})`);
                drawConnectionLine(currentTopicCell, selectedCell);
            }
        } else {
            console.log(`Skipping line drawing: round ${round} <= 1 or no topic block`);
        }

        console.log(`Filled cell at row ${selectedCell.dataset.row}, col ${selectedCell.dataset.col} with article: ${articleTitle}`);
        selectedCell = null;
        input.value = '';
    }
});

// Handle grid size change
gridSizeSelect.addEventListener('change', () => {
    if (!gameStarted) {
        gridSize = parseInt(gridSizeSelect.value);
        generateGrid();
    } else {
        showPopup('Cannot change grid size after the game has started.');
        gridSizeSelect.value = gridSize;
    }
});

// Handle banner button popups
document.getElementById('how-to-play-button').addEventListener('click', () => {
    showPopup(
        'How to Play Territory 1 v 1',
        `
        <p style="text-align: left; margin-bottom: 20px;">
            1. Share the game link with a friend to start a multiplayer game.<br>
            2. Take turns placing blocks on the grid by connecting Wikipedia articles.<br>
            3. Each block must be placed adjacent to the current topic block.<br>
            4. Use the "Free Block" option to place a block anywhere (once per game).<br>
            5. Concede a turn if you can't make a move, but two consecutive concessions end the game.<br>
            6. Capture opponent cells by surrounding them to gain more territory.<br>
            7. The game ends when the grid is full or after two consecutive concessions.<br>
            8. The player with the most cells wins!<br>
        </p>
        `
    );
});

// Initialize Firebase Authentication and show initial popup
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        console.log('Signed in anonymously:', currentUser.uid);
        // Show initial popup instead of checking URL or showing start button
        showInitialPopup();
    } else {
        auth.signInAnonymously().catch((error) => {
            console.error('Error signing in anonymously:', error);
            showPopup('Error signing in. Please try again.');
        });
    }
});

// Initialize the game
generateGrid();
displayGameWindow();

// Disable input until the game starts
input.disabled = true;