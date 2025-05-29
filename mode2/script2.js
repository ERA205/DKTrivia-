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

// Create groups for lines
const lineGroup = document.getElementById('line-group');
let usingFreeBlock = false; // Tracks if the player is using a free block
let lastTurnConceded = false; // Tracks if the previous turn was conceded

// Track the currently selected grid cell
let selectedCell = null;

// Track filled cells and their data
const filledCells = new Map(); // Maps cell (DOM element) to { article, ratio, views, node, player }

// Store CSV data
let gameCsvData = [];



// Track the current topic block (the article displayed in the info window)
let currentTopicArticle = null;
let currentTopicCell = null; // The cell currently displayed in the info window

// Multiplayer state
let currentUser = null; // Current player's user ID
let gameId = null; // Current game ID
let playerNumber = null; // "player1" or "player2"
let gameRef = null; // Firebase database reference for the game
let gameStarted = false; // Track if the game has started

// Function to generate a random game ID
function generateGameId() {
    return Math.random().toString(36).substr(2, 9);
}

// Function to show a popup message
function showPopup(message, additionalContent = null) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <p>${message}</p>
        ${additionalContent || ''}
        <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px;">Close</button>
    `;
    popup.querySelector('button').addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
    return popup;
}

// Function to show the sharable link popup
function showShareLinkPopup(gameId) {
    const shareUrl = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`;
    showPopup('Share this link with your friend to start the game:', `
        <input type="text" id="share-link" value="${shareUrl}" readonly>
    `);
}

// Function to initialize a new game
function startNewGame() {
    gameId = generateGameId();
    playerNumber = 'player1';
    const gameData = {
        grid: {}, // Store grid as a flat object with keys like "row_col"
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
        ratios: { player1: [], player2: [] } // Initialize ratios
    };
    gameRef = database.ref(`territory_games/${gameId}`);
    gameRef.set(gameData).then(() => {
        showShareLinkPopup(gameId);
        listenForGameUpdates();
        startGameButton.style.display = 'none'; // Hide the "Start Game" button after creating the game
    }).catch((error) => {
        console.error('Error starting new game:', error);
        showPopup('Error starting new game. Please try again.');
    });
}

// Function to join an existing game
function joinGame(gameId) {
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
        if (gameData.players.player1 === currentUser.uid) {
            playerNumber = 'player1';
            showShareLinkPopup(gameId);
        } else if (!gameData.players.player2) {
            playerNumber = 'player2';
            gameRef.update({
                'players/player2': currentUser.uid
            }).then(() => {
                listenForGameUpdates();
                startGameButton.style.display = 'none'; // Hide the "Start Game" button after joining
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

function updateGrid(grid, round) {
    console.log('Updating grid with data:', grid);

    // Clear existing grid visuals, but preserve connection nodes
    const cells = gridContainer.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        // Remove child elements except for .connection-node
        Array.from(cell.children).forEach(child => {
            if (!child.classList.contains('connection-node')) {
                cell.removeChild(child);
            }
        });
    });
    filledCells.clear();
    lineGroup.innerHTML = ''; // Clear connection lines

    // Handle the grid as a flat object with "row_col" keys
    const gridData = grid || {};

    // Rebuild grid based on flat data
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = gridContainer.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            const cellKey = `${row}_${col}`;
            const cellData = gridData[cellKey];
            if (cellData) {
                console.log(`Rendering cell ${cellKey} with player: ${cellData.player}`);
                // Update the cell's classes to reflect the current player
                cell.classList.remove('player1', 'player2'); // Remove existing player classes
                cell.classList.add('filled', cellData.player); // Add 'filled' and the current player class
                if (!filledCells.has(cell)) {
                    // Ensure connection node exists
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

                    // Draw line if this cell connects to another block, but skip for the first two blocks (round <= 1)
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



function listenForGameUpdates() {
    let joinPopup = null; // Track the "Two players have joined!" popup

    gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) {
            console.log('No game data received from Firebase');
            return;
        }

        console.log('Received Firebase update:', gameData);

        // Ensure turn indicator updates even if grid update fails
        updateTurnIndicator(gameData.currentTurn, gameData.players);
        updateScores(gameData.scores);

        // Attempt to update the grid
        const grid = gameData.grid || {};
        const round = gameData.round || 0;
        try {
            console.log('Calling updateGrid with grid:', grid);
            updateGrid(grid, round); // Pass round to updateGrid
        } catch (error) {
            console.error('Error updating grid:', error);
        }

        // Update topic block and info window
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

        // Show join popup when both players are present
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

        // Remove join popup when game starts
        if (gameData.status === 'active' && joinPopup) {
            joinPopup.remove();
            joinPopup = null;
        }

        // Handle game end (stop listening)
        if (gameData.status === 'finished') {
            gameRef.off(); // Stop listening for updates
        }
    }, (error) => {
        console.error('Error listening for game updates:', error);
        showPopup('Error loading game updates. Please try again.');
    });
}



// Function to update the turn indicator
function updateTurnIndicator(currentTurn, players) {
    if (currentTurn) {
        const isMyTurn = (currentTurn === 'player1' && players.player1 === currentUser.uid) ||
                         (currentTurn === 'player2' && players.player2 === currentUser.uid);
        turnIndicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
        turnIndicator.style.color = isMyTurn ? '#00FF00' : '#FF0000';
        // Enable/disable input based on turn
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
        console.log(`API Response for "${articleTitle}" thumbnail:`, data);
        
        const pages = data.query.pages;
        const pageId = Object.keys(pages)[0];
        
        if (pageId === '-1') {
            console.log(`Page not found for "${articleTitle}"`);
            return null;
        }
        
        const page = pages[pageId];
        if (!page.thumbnail || !page.thumbnail.source) {
            console.log(`No thumbnail available for "${articleTitle}"`);
            return null;
        }
        
        const thumbnailUrl = page.thumbnail.source;
        console.log(`Thumbnail URL for "${articleTitle}": ${thumbnailUrl}`);
        return thumbnailUrl;
    } catch (error) {
        console.error(`Error fetching image for "${articleTitle}":`, error);
        return null;
    }
}

// Function to fetch average monthly views for a Wikipedia article
async function fetchAverageMonthlyViews(articleTitle) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 30); // Last 30 days
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
            const averageMonthlyViews = Math.round(averageDailyViews * 30.42); // Average days per month
            console.log(`Average monthly views for "${articleTitle}": ${averageMonthlyViews}`);
            return { formatted: averageMonthlyViews.toLocaleString(), raw: averageMonthlyViews };
        }
        console.log(`No view data for "${articleTitle}"`);
        return { formatted: 'N/A', raw: 0 };
    } catch (error) {
        console.error(`Error fetching views for "${articleTitle}":`, error);
        return { formatted: 'N/A', raw: 0 };
    }
}

// Function to fetch wikitext and check for hyperlinks bidirectionally
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

        let csv = 'Article,Hyperlink\n';
        hyperlinks.forEach(({ article, hyperlink }) => {
            csv += `"${article.replace(/"/g, '""')}","${hyperlink.replace(/"/g, '""')}"\n`;
        });
        console.log('Hyperlinks CSV:\n', csv);

        const normalizedTopic = topicTitle.replace(/\s+/g, '_');
        const normalizedSubject = subjectTitle.replace(/\s+/g, '_');
        const subjectHasTopic = subjectLinks.some(link => link.replace(/\s+/g, '_').toLowerCase() === normalizedTopic.toLowerCase());
        const topicHasSubject = topicLinks.some(link => link.replace(/\s+/g, '_').toLowerCase() === normalizedSubject.toLowerCase());

        return subjectHasTopic || topicHasSubject;
    } catch (error) {
        console.error('Error fetching wikitext:', error);
        return false;
    }
}

// Function to generate CSV content
function generateCsvContent() {
    const headers = 'Article Name,Ratio,Points Earned,Average Monthly Views\n';
    const rows = gameCsvData.map(data => 
        `"${data.article.replace(/"/g, '""')}","${data.ratio}","${data.pointsEarned || 0}","${data.views}"`
    ).join('\n');
    return headers + rows;
}

// Check if a cell is adjacent to a given cell (used for topic block adjacency)
function isAdjacentToCell(cellRow, cellCol, targetRow, targetCol) {
    const rowDiff = Math.abs(cellRow - targetRow);
    const colDiff = Math.abs(cellCol - targetCol);
    // Must be exactly 1 grid space away (up, down, left, or right)
    return (rowDiff === 1 && colDiff === 0) || (rowDiff === 0 && colDiff === 1);
}

// Function to get the absolute position of an element
function getAbsolutePosition(element) {
    const rect = element.getBoundingClientRect();
    return {
        x: rect.left + window.scrollX + (rect.width / 2), // Center of the element
        y: rect.top + window.scrollY + (rect.height / 2)  // Center of the element
    };
}

// Function to draw a connection line between two nodes using SVG
function drawConnectionLine(fromCell, toCell) {
    const fromNode = fromCell.querySelector('.connection-node');
    const toNode = toCell.querySelector('.connection-node');
    if (!fromNode || !toNode) {
        console.log('Cannot draw line: fromNode or toNode not found');
        return;
    }

    // Get the bounding rectangle of the grid container
    const gridRect = gridContainer.getBoundingClientRect();

    // Get the bounding rectangles of the nodes
    const fromRect = fromNode.getBoundingClientRect();
    const toRect = toNode.getBoundingClientRect();

    // Calculate center positions relative to the grid container
    const fromX = fromRect.left - gridRect.left + fromRect.width / 2;
    const fromY = fromRect.top - gridRect.top + fromRect.height / 2;
    const toX = toRect.left - gridRect.left + toRect.width / 2;
    const toY = toRect.top - gridRect.top + toRect.height / 2;

    // Create the SVG line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromX);
    line.setAttribute('y1', fromY);
    line.setAttribute('x2', toX);
    line.setAttribute('y2', toY);
    line.setAttribute('stroke', '#333333');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-linecap', 'round');

    // Append to the line group
    lineGroup.appendChild(line);
    console.log(`Line drawn from (${fromX}, ${fromY}) to (${toX}, ${toY})`);
}

// Generate the 5x5 grid
function generateGrid() {
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.addEventListener('click', () => {
                // If the cell is filled, display its info in the game window
                if (cell.classList.contains('filled')) {
                    const cellData = filledCells.get(cell);
                    displayGameWindow({
                        title: cellData.article,
                        imageUrl: cellData.imageUrl,
                        views: cellData.views.formatted
                    });
                    // Update the topic block in Firebase
                    gameRef.update({
                        topicBlock: {
                            row: row,
                            col: col,
                            article: cellData.article
                        }
                    }).catch((error) => {
                        console.error('Error updating topic block:', error);
                        showPopup('Error updating topic block. Please try again.');
                    });
                    currentTopicArticle = cellData.article;
                    currentTopicCell = cell; // Ensure this is set immediately
                    console.log(`Displaying info for filled cell at row ${row}, col ${col}: ${cellData.article}`);
                    return;
                }

                // If the cell is not filled, handle selection
                gameRef.once('value').then(snapshot => {
                    const gameData = snapshot.val();
                    const round = gameData?.round || 0;
                    const scores = gameData?.scores || { player1: { points: 0 }, player2: { points: 0 } };
                    const playerPoints = scores[playerNumber]?.points || 0;
                    const canPlaceAnywhere = round <= 1 || (playerPoints >= 5 && confirm(`You have ${playerPoints} points. Use 5 points to place a block anywhere?`));

                    if (canPlaceAnywhere) {
                        // First two blocks (round 0 or 1) or placing anywhere
                        if (selectedCell) {
                            selectedCell.classList.remove('selected');
                        }
                        cell.classList.add('selected');
                        selectedCell = cell;
                        console.log(`Cell at row ${row}, col ${col} selected (first block or placing anywhere)`);
                    } else {
                        // After the first two blocks, must be adjacent to the topic block
                        if (!currentTopicCell) {
                            console.log('No topic block selected; cannot select cell');
                            return;
                        }
                        const topicRow = parseInt(currentTopicCell.dataset.row);
                        const topicCol = parseInt(currentTopicCell.dataset.col);
                        if (isAdjacentToCell(row, col, topicRow, topicCol)) {
                            if (selectedCell) {
                                selectedCell.classList.remove('selected');
                            }
                            cell.classList.add('selected');
                            selectedCell = cell;
                            console.log(`Cell at row ${row}, col ${col} selected, adjacent to topic block at row ${topicRow}, col ${topicCol}`);
                        } else {
                            console.log(`Cell at row ${row}, col ${col} not adjacent to topic block at row ${topicRow}, col ${topicCol}, cannot select`);
                        }
                    }
                }).catch(error => {
                    console.error('Error fetching game state in generateGrid:', error);
                });
            });
            gridContainer.appendChild(cell);
        }
    }
}

function displayGameWindow(articleData = null) {
    gameWindow.style.width = '300px';
    gameWindow.style.paddingLeft = '2%';
    gameWindow.style.paddingRight = '2%';
    gameWindow.style.paddingTop = '10px';
    gameWindow.style.paddingBottom = '10px';
    gameWindow.style.boxSizing = 'border-box';

    // Fetch game state to determine the current state
    gameRef.once('value').then(snapshot => {
        const gameData = snapshot.val();
        const gameStatus = gameData?.status || 'waiting';

        // Clear existing content
        gameWindow.innerHTML = '';

        // If the game is finished, show the game-over popup (only once)
        if (gameStatus === 'finished') {
            const scores = gameData?.scores || { player1: { points: 0, cells: 0 }, player2: { points: 0, cells: 0 } };
            const winner = scores.player1.cells > scores.player2.cells ? 'Player 1' : 
                          scores.player2.cells > scores.player1.cells ? 'Player 2' : 'Tie';
            if (!gameWindow.dataset.gameOverPopupShown) {
                showPopup(`Game Over! Winner: ${winner}`, `
                    <p>Player 1: ${scores.player1.cells} cells</p>
                    <p>Player 2: ${scores.player2.cells} cells</p>
                `);
                gameWindow.dataset.gameOverPopupShown = 'true'; // Prevent duplicate popups
            }

            // Show a "Start New Game" button to reset the game
            const startNewGameButton = document.createElement('button');
            startNewGameButton.id = 'start-game-button';
            startNewGameButton.textContent = 'Start New Game';
            startNewGameButton.style.backgroundColor = '#6273B4';
            startNewGameButton.style.color = '#fff';
            startNewGameButton.style.border = 'none';
            startNewGameButton.style.padding = '10px 20px';
            startNewGameButton.style.borderRadius = '5px';
            startNewGameButton.style.cursor = 'pointer';
            startNewGameButton.style.display = 'block';
            startNewGameButton.style.margin = '10px auto';
            startNewGameButton.addEventListener('click', () => {
                if (!currentUser) {
                    showPopup('Please wait, signing in...');
                    return;
                }
                startNewGame();
                // Reset the game-over popup flag
                gameWindow.dataset.gameOverPopupShown = '';
            });
            gameWindow.appendChild(startNewGameButton);
            return; // Stop rendering the info window since the game is over
        }

        // Reset the game-over popup flag if the game is not finished
        gameWindow.dataset.gameOverPopupShown = '';

        if (!articleData) {
            const placeholder = document.createElement('p');
            placeholder.textContent = 'Territory 1 v 1 - Info Window';
            placeholder.style.textAlign = 'center';
            placeholder.style.color = '#6273B4';
            placeholder.style.display = 'block';
            placeholder.style.margin = '0 auto';
            gameWindow.appendChild(placeholder);

            // Show the "Start Game" button if the game hasn't started
            if (gameStatus === 'waiting') {
                const startGameButton = document.createElement('button');
                startGameButton.id = 'start-game-button';
                startGameButton.textContent = 'Start Game';
                startGameButton.style.backgroundColor = '#6273B4';
                startGameButton.style.color = '#fff';
                startGameButton.style.border = 'none';
                startGameButton.style.padding = '10px 20px';
                startGameButton.style.borderRadius = '5px';
                startGameButton.style.cursor = 'pointer';
                startGameButton.style.display = 'block';
                startGameButton.style.margin = '10px auto';
                startGameButton.addEventListener('click', () => {
                    if (!currentUser) {
                        showPopup('Please wait, signing in...');
                        return;
                    }
                    startNewGame();
                });
                gameWindow.appendChild(startGameButton);
            }
        } else {
            if (articleData.imageUrl) {
                const img = document.createElement('img');
                img.src = articleData.imageUrl;
                img.alt = `${articleData.title} main image`;
                img.style.maxWidth = '100%';
                img.style.maxHeight = '300px';
                img.style.display = 'block';
                img.style.margin = '0 auto';
                gameWindow.appendChild(img);
            } else {
                const placeholder = document.createElement('p');
                placeholder.textContent = 'No main image available';
                placeholder.style.textAlign = 'center';
                placeholder.style.color = '#6273B4';
                placeholder.style.display = 'block';
                placeholder.style.margin = '0 auto';
                gameWindow.appendChild(placeholder);
            }

            const titleText = document.createElement('p');
            titleText.style.textAlign = 'center';
            titleText.style.margin = '10px 0 0 0';
            titleText.style.fontFamily = 'Arial, sans-serif';
            titleText.style.fontSize = '14px';
            titleText.style.fontWeight = 'bold';
            titleText.textContent = articleData.title;
            gameWindow.appendChild(titleText);

            const viewsText = document.createElement('p');
            viewsText.style.textAlign = 'center';
            viewsText.style.margin = '10px 0 0 0';
            viewsText.style.fontFamily = 'Arial, sans-serif';
            viewsText.style.fontSize = '14px';
            
            const viewsLabelSpan = document.createElement('span');
            viewsLabelSpan.textContent = 'Monthly Views: ';
            viewsLabelSpan.style.color = '#000000';
            
            const viewsSpan = document.createElement('span');
            viewsSpan.style.color = '#6273B4';
            viewsSpan.textContent = articleData.views;
            
            viewsText.appendChild(viewsLabelSpan);
            viewsText.appendChild(viewsSpan);
            gameWindow.appendChild(viewsText);

            // Create a container for scores to avoid duplication
            const pointsContainer = document.createElement('div');
            pointsContainer.id = 'points-container';
            pointsContainer.style.textAlign = 'center';
            pointsContainer.style.margin = '10px 0 0 0';
            pointsContainer.style.fontFamily = 'Arial, sans-serif';
            pointsContainer.style.fontSize = '14px';

            const scores = gameData?.scores || { player1: { points: 0, cells: 0 }, player2: { points: 0, cells: 0 } };
            const players = gameData?.players || { player1: null, player2: null };
            const currentTurn = gameData?.currentTurn || 'player1';

            // Clear existing points content
            const existingPoints = gameWindow.querySelector('#points-container');
            if (existingPoints) {
                existingPoints.innerHTML = '';
            }

            const p1PointsSpan = document.createElement('span');
            p1PointsSpan.textContent = `Player 1 Points: ${scores.player1.points || 0}`;
            p1PointsSpan.style.color = '#1E90FF'; // Dodger Blue for Player 1
            pointsContainer.appendChild(p1PointsSpan);

            pointsContainer.appendChild(document.createElement('br'));

            const p2PointsSpan = document.createElement('span');
            p2PointsSpan.textContent = `Player 2 Points: ${scores.player2.points || 0}`;
            p2PointsSpan.style.color = '#FF4500'; // Orange Red for Player 2
            pointsContainer.appendChild(p2PointsSpan);

            // Determine if the "Free Block" button should be shown
            const isMyTurn = (currentTurn === 'player1' && players.player1 === currentUser.uid) ||
                             (currentTurn === 'player2' && players.player2 === currentUser.uid);
            const currentPlayerPoints = currentTurn === 'player1' ? (scores.player1.points || 0) : (scores.player2.points || 0);
            const playerKey = currentTurn === 'player1' ? 'player1' : 'player2';

            if (isMyTurn && currentPlayerPoints >= 5) {
                pointsContainer.appendChild(document.createElement('br'));
                const freeBlockButton = document.createElement('button');
                freeBlockButton.id = 'free-block-button';
                freeBlockButton.textContent = 'Free Block';
                freeBlockButton.style.backgroundColor = '#6273B4';
                freeBlockButton.style.color = '#fff';
                freeBlockButton.style.border = 'none';
                freeBlockButton.style.padding = '5px 10px';
                freeBlockButton.style.borderRadius = '5px';
                freeBlockButton.style.cursor = 'pointer';
                freeBlockButton.style.marginTop = '5px';
                freeBlockButton.addEventListener('click', () => {
                    usingFreeBlock = true; // Enable free block mode
                    // Deduct 5 points immediately
                    const updatedScores = { ...scores };
                    updatedScores[playerKey].points = (updatedScores[playerKey].points || 0) - 5;
                    gameRef.update({ scores: updatedScores }).catch(error => {
                        console.error('Error deducting points for free block:', error);
                    });
                });
                pointsContainer.appendChild(freeBlockButton);
            }

            // Add "Concede Turn" button (always visible, but disabled if not player's turn)
            pointsContainer.appendChild(document.createElement('br'));
            const concedeTurnButton = document.createElement('button');
            concedeTurnButton.id = 'concede-turn-button';
            concedeTurnButton.textContent = 'Concede Turn';
            concedeTurnButton.style.backgroundColor = isMyTurn ? '#6273B4' : '#cccccc'; // Greyed out if not player's turn
            concedeTurnButton.style.color = '#fff';
            concedeTurnButton.style.border = 'none';
            concedeTurnButton.style.padding = '5px 10px';
            concedeTurnButton.style.borderRadius = '5px';
            concedeTurnButton.style.cursor = isMyTurn ? 'pointer' : 'not-allowed';
            concedeTurnButton.style.marginTop = '5px';
            concedeTurnButton.disabled = !isMyTurn; // Disable button if not player's turn
            concedeTurnButton.addEventListener('click', () => {
                if (!isMyTurn) return; // Extra safeguard (shouldn't be needed with disabled)

                // Fetch the latest game state to ensure we have the most current data
                gameRef.once('value').then(snapshot => {
                    const gameData = snapshot.val();
                    const currentScores = gameData?.scores || { player1: { points: 0, cells: 0 }, player2: { points: 0, cells: 0 } };
                    const currentTurn = gameData?.currentTurn || 'player1';

                    // Determine the next player and award them a point
                    const nextTurn = currentTurn === 'player1' ? 'player2' : 'player1';
                    const updatedScores = { ...currentScores };
                    updatedScores[nextTurn].points = (updatedScores[nextTurn].points || 0) + 1;

                    // Check for consecutive concedes
                    let updates = {
                        currentTurn: nextTurn,
                        scores: updatedScores
                    };

                    if (lastTurnConceded) {
                        // Consecutive concede: end the game
                        updates.status = 'finished';
                        const winner = updatedScores.player1.cells > updatedScores.player2.cells ? 'Player 1' : 
                                      updatedScores.player2.cells > updatedScores.player1.cells ? 'Player 2' : 'Tie';
                        showPopup(`Game Over! Winner: ${winner}`, `
                            <p>Player 1: ${updatedScores.player1.cells} cells</p>
                            <p>Player 2: ${updatedScores.player2.cells} cells</p>
                        `);
                    }

                    // Update lastTurnConceded
                    lastTurnConceded = true;

                    // Update Firebase
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
    }).catch(error => {
        console.error('Error fetching scores for points display:', error);
    });
}

// Handle text input
input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim() !== '') {
        const userInput = input.value.trim();
        console.log(`User entered: ${userInput}`);

        // Check if a grid cell is selected
        if (!selectedCell) {
            showPopup('Please Select a Grid Location');
            input.value = '';
            return;
        }

        // Check if the input is a valid Wikipedia article
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

        // Declare baseRatio and round in the outer scope
        let baseRatio = 0;
        let round = 0;
        let currentGrid = null;
        let scores = null;
        let currentTurn = null;

        // Read the current game state
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

        // Get the current game state
        currentGrid = gameData.grid || {};
        round = gameData.round || 0;
        scores = gameData.scores || { player1: { cells: 0, points: 0 }, player2: { cells: 0, points: 0 } };
        currentTurn = gameData.currentTurn || 'player1';
        playerNumber = currentTurn;
        console.log(`Current turn: ${currentTurn}, Player number: ${playerNumber}`);

        // Check if the player is using a free block
        let canPlaceAnywhere = usingFreeBlock;

        // If not the first two rounds (round > 1), require a topic block unless placing anywhere
        const row = parseInt(selectedCell.dataset.row);
        const col = parseInt(selectedCell.dataset.col);
        if (!canPlaceAnywhere && round > 1) { // Round 0 (Player 1's first block) and Round 1 (Player 2's first block) allow placement anywhere
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

            // Check if the selected cell is adjacent to the topic block
            if (!isAdjacentToCell(row, col, topicRow, topicCol)) {
                showPopup('Selected cell must be adjacent to the topic block.');
                input.value = '';
                if (selectedCell) {
                    selectedCell.classList.remove('selected');
                    selectedCell = null;
                }
                return;
            }

            // Check if the new article connects to the current topic article
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

            // Calculate ratio (views of new article / views of topic article)
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
            // First block for each player (round 0 or 1) or using a free block, no connection check needed
            baseRatio = 1; // First block has a ratio of 1
            console.log(`First block ratio set to 1 for ${articleTitle}`);
        }

        // Reset usingFreeBlock after use
        if (usingFreeBlock) {
            usingFreeBlock = false; // Reset after use
        }

        // Update the specific cell in the grid using "row_col" key
        const cellKey = `${row}_${col}`;
        currentGrid[cellKey] = {
            article: articleTitle,
            imageUrl: await fetchMainImage(articleTitle),
            views: await fetchAverageMonthlyViews(articleTitle),
            player: playerNumber,
            connectionTo: currentTopicCell && !canPlaceAnywhere && round > 1 ? [parseInt(currentTopicCell.dataset.row), parseInt(currentTopicCell.dataset.col)] : null
        };

        // Update cells count
        scores[playerNumber].cells = (scores[playerNumber].cells || 0) + 1;

        // Award points for lowest ratio at the end of each round (after both players have placed a block)
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

        // Initialize ratios if not present
        let ratios = gameData.ratios || { player1: [], player2: [] };
        if (!ratios.player1) ratios.player1 = [];
        if (!ratios.player2) ratios.player2 = [];

        if (round % 2 === 1 && round > 0) { // End of a round (both players have placed a block)
            ratios[playerNumber].push(baseRatio);
            updates.ratios = ratios;

            // Compare the last two ratios (one from each player)
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
            // Store the ratio for this move
            ratios[playerNumber].push(baseRatio);
            updates.ratios = ratios;
        }

        // Check for completely surrounded blocks (existing logic)
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                const key = `${r}_${c}`;
                const cell = currentGrid[key];
                if (cell && cell.player !== playerNumber) {
                    // Check if the cell is surrounded by the current player's blocks
                    const surrounded = [
                        { dr: -1, dc: 0 }, // Up
                        { dr: 1, dc: 0 },  // Down
                        { dr: 0, dc: -1 }, // Left
                        { dr: 0, dc: 1 }   // Right
                    ].every(({ dr, dc }) => {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr < 0 || nr >= 5 || nc < 0 || nc >= 5) return true; // Out of bounds counts as surrounded
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

        // New capture feature: Capture a block if more than 50% of surrounding cells belong to the opposing player
        for (let r = 0; r < 5; r++) {
            for (let c = 0; c < 5; c++) {
                const key = `${r}_${c}`;
                const cell = currentGrid[key];
                if (cell) {
                    const currentOwner = cell.player;
                    const opposingPlayer = currentOwner === 'player1' ? 'player2' : 'player1';

                    // Determine the maximum number of surrounding cells based on position
                    const directions = [
                        { dr: -1, dc: 0 }, // Up
                        { dr: 1, dc: 0 },  // Down
                        { dr: 0, dc: -1 }, // Left
                        { dr: 0, dc: 1 }   // Right
                    ];

                    let maxSurrounding = 0;
                    let opposingCount = 0;
                    directions.forEach(({ dr, dc }) => {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) { // Valid cell within grid
                            maxSurrounding++;
                            const neighborKey = `${nr}_${nc}`;
                            const neighbor = currentGrid[neighborKey];
                            if (neighbor && neighbor.player === opposingPlayer) {
                                opposingCount++;
                            }
                        }
                    });

                    // Determine the capture threshold (more than 50%)
                    let captureThreshold;
                    if (maxSurrounding === 4) { // Interior block
                        captureThreshold = 3; // 3 out of 4
                    } else if (maxSurrounding === 3) { // Edge block
                        captureThreshold = 2; // 2 out of 3
                    } else if (maxSurrounding === 2) { // Corner block
                        captureThreshold = 2; // 2 out of 2
                    } else {
                        continue; // Skip if maxSurrounding is 0 or invalid
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

        // Check if the grid is full
        let filledCellsCount = Object.keys(currentGrid).length;
        if (filledCellsCount >= 25) {
            updates.status = 'finished';
        }

        // Reset lastTurnConceded since a block was placed
        lastTurnConceded = false;

        // Update Firebase
        await gameRef.update(updates);

        // Local updates
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

        // Ensure the DOM is updated before drawing the line
        await new Promise(resolve => setTimeout(resolve, 0));

        // Draw the line immediately if a topic block exists and round > 1
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

// Handle banner button popups
document.getElementById('how-to-play-button').addEventListener('click', () => {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <p style="font-weight: bold; font-size: 18px; margin-bottom: 15px;">How to Play Territory 1 v 1</p>
        <p style="text-align: left; margin-bottom: 20px;">
            1. Share the game link with a friend to start a multiplayer game.<br>
            2. Take turns placing blocks on the grid by connecting Wikipedia articles.<br>
            3. Each block must be placed adjacent to the current topic block.<br>
            4. The game ends when the grid is full (25 cells).<br>
            5. The player with the most blocks wins!<br>
            <a href="../index.html">Back to Main Game</a>
        </p>
        <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
    `;
    popup.querySelector('button').addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
});

// Handle "Start Game" button click
startGameButton.addEventListener('click', () => {
    if (!currentUser) {
        showPopup('Please wait, signing in...');
        return;
    }
    startNewGame();
});

// Initialize Firebase Authentication and start/join game
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        console.log('Signed in anonymously:', currentUser.uid);

        // Add a slight delay to ensure authentication state is propagated
        setTimeout(() => {
            // Check for gameId in URL
            const urlParams = new URLSearchParams(window.location.search);
            gameId = urlParams.get('gameId');

            if (gameId) {
                joinGame(gameId);
            }
        }, 1000); // 1-second delay to ensure auth state is ready
    } else {
        // No user is signed in, attempt to sign in anonymously
        auth.signInAnonymously().catch((error) => {
            console.error('Error signing in anonymously:', error);
            showPopup('Error signing in. Please try again.');
        });
        // Ensure the "Start Game" button is visible on page load if game hasn't started
    if (!gameId) {
        startGameButton.style.display = 'block';
    }
    }
});

// Initialize the game
generateGrid();
displayGameWindow();

// Disable input until the game starts
input.disabled = true;