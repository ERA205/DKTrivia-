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
const lineSvg = document.getElementById('line-svg');
const gridContainer = document.getElementById('grid-container');
const input = document.getElementById('connection-input');
const gameWindow = document.getElementById('game-window');
const turnIndicator = document.getElementById('turn-indicator');
const scoreDisplay = document.getElementById('score-display');
const startGameButton = document.getElementById('start-game-button');

// Create groups for lines
const lineGroup = document.getElementById('line-group');

// Track the currently selected grid cell
let selectedCell = null;

// Track filled cells and their data
const filledCells = new Map(); // Maps cell (DOM element) to { article, ratio, views, node, player }

// Store CSV data
let gameCsvData = [];

// Track if the first block has been filled
let isFirstBlockFilled = false;

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
            player1: 0,
            player2: 0
        },
        round: 0
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

// Function to listen for game updates
function listenForGameUpdates() {
    let joinPopup = null; // Track the "Two players have joined!" popup
    gameRef.on('value', (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) return;
    
        // Ensure turn indicator updates even if grid update fails
        updateTurnIndicator(gameData.currentTurn, gameData.players);
        updateScores(gameData.scores);
    
        // Attempt to update the grid
        const grid = gameData.grid || {};
        try {
            updateGrid(grid);
        } catch (error) {
            console.error('Error updating grid:', error);
        }
    
        if (gameData.topicBlock) {
            const { row, col, article } = gameData.topicBlock;
            currentTopicArticle = article;
            currentTopicCell = gridContainer.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
            const cellData = filledCells.get(currentTopicCell);
            if (cellData) {
                displayGameWindow({
                    title: cellData.article,
                    imageUrl: cellData.imageUrl,
                    views: cellData.views.formatted
                });
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
            const winner = gameData.scores.player1 > gameData.scores.player2 ? 'Player 1' : 
                          gameData.scores.player2 > gameData.scores.player1 ? 'Player 2' : 'Tie';
            showPopup(`Game Over! Winner: ${winner}`, `
                <p>Player 1: ${gameData.scores.player1} cells</p>
                <p>Player 2: ${gameData.scores.player2} cells</p>
            `);
            gameRef.off();
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
    scoreDisplay.textContent = `Player 1: ${scores.player1} | Player 2: ${scores.player2}`;
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
    if (!fromNode || !toNode) return;

    const fromPos = getAbsolutePosition(fromNode);
    const toPos = getAbsolutePosition(toNode);

    // Create an SVG line element
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', fromPos.x);
    line.setAttribute('y1', fromPos.y);
    line.setAttribute('x2', toPos.x);
    line.setAttribute('y2', toPos.y);
    line.setAttribute('stroke', '#333333'); // Dark grey
    line.setAttribute('stroke-width', '5'); // 5px wide line
    line.setAttribute('stroke-linecap', 'round'); // Optional: rounded ends

    // Append the line to the SVG group
    lineGroup.appendChild(line);
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
                    currentTopicCell = cell;
                    console.log(`Displaying info for filled cell at row ${row}, col ${col}: ${cellData.article}`);
                    return;
                }

                // If the cell is not filled, handle selection
                if (!isFirstBlockFilled) {
                    // First block can be placed anywhere
                    if (selectedCell) {
                        selectedCell.classList.remove('selected');
                    }
                    cell.classList.add('selected');
                    selectedCell = cell;
                    console.log(`Cell at row ${row}, col ${col} selected (first block)`);
                } else {
                    // After the first block, must be adjacent to the topic block
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

    // Preserve the "Start Game" button
    const startButton = gameWindow.querySelector('#start-game-button');
    const buttonHtml = startButton ? startButton.outerHTML : '';

    // Clear existing content except the button placeholder
    gameWindow.innerHTML = '';

    if (!articleData) {
        const placeholder = document.createElement('p');
        placeholder.textContent = 'Territory 1 v 1 - Info Window';
        placeholder.style.textAlign = 'center';
        placeholder.style.color = '#6273B4';
        placeholder.style.display = 'block';
        placeholder.style.margin = '0 auto';
        gameWindow.appendChild(placeholder);
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
    }

    // Re-append the "Start Game" button if it exists
    if (buttonHtml) {
        gameWindow.innerHTML += buttonHtml;
        // Re-attach event listener to the new button instance
        const newButton = gameWindow.querySelector('#start-game-button');
        if (newButton) {
            newButton.addEventListener('click', () => {
                if (!currentUser) {
                    showPopup('Please wait, signing in...');
                    return;
                }
                startNewGame();
            });
        }
    }
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
            return;
        }

        // If not the first block, check if the selected cell is adjacent to the topic block
        let baseRatio = 0;
        const row = parseInt(selectedCell.dataset.row);
        const col = parseInt(selectedCell.dataset.col);
        if (isFirstBlockFilled) {
            if (!currentTopicCell) {
                showPopup('No topic block selected. Click a filled block to set the topic.');
                input.value = '';
                return;
            }

            const topicRow = parseInt(currentTopicCell.dataset.row);
            const topicCol = parseInt(currentTopicCell.dataset.col);

            // Check if the selected cell is adjacent to the topic block
            if (!isAdjacentToCell(row, col, topicRow, topicCol)) {
                showPopup('Selected cell must be adjacent to the topic block.');
                input.value = '';
                return;
            }

            // Check if the new article connects to the current topic article
            const hasLink = await checkWikitextForLink(articleTitle, currentTopicArticle);
            if (!hasLink) {
                showPopup('Input does not match. Try again.');
                input.value = '';
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
            // First block, no connection check needed
            isFirstBlockFilled = true;
            const viewsData = await fetchAverageMonthlyViews(articleTitle);
            baseRatio = 1; // First block has a ratio of 1
            console.log(`First block ratio set to 1 for ${articleTitle}`);
        }

        // Read the current game state
        // Read the current game state
gameRef.once('value').then(async (snapshot) => {
    const gameData = snapshot.val() || { 
        scores: { player1: 0, player2: 0 }, 
        grid: {},
        round: 0
    };

    // Get the current grid as a flat object
    const currentGrid = gameData.grid || {};

    // Update the specific cell in the grid using "row_col" key
    const row = parseInt(selectedCell.dataset.row);
    const col = parseInt(selectedCell.dataset.col);
    const cellKey = `${row}_${col}`;
    currentGrid[cellKey] = {
        article: articleTitle,
        imageUrl: await fetchMainImage(articleTitle),
        views: await fetchAverageMonthlyViews(articleTitle),
        player: playerNumber,
        connectionTo: currentTopicCell ? [parseInt(currentTopicCell.dataset.row), parseInt(currentTopicCell.dataset.col)] : null
    };

    // Prepare updates
    const updates = {
        grid: currentGrid, // Update the entire grid object
        currentTurn: playerNumber === 'player1' ? 'player2' : 'player1',
        scores: { ...gameData.scores, [playerNumber]: (gameData.scores[playerNumber] || 0) + 1 },
        topicBlock: {
            row: row,
            col: col,
            article: articleTitle
        },
        round: (gameData.round || 0) + 1
    };

    // Check if the grid is full
    let filledCellsCount = Object.keys(currentGrid).length;
    if (filledCellsCount >= 25) {
        updates.status = 'finished';
    }

    // Update Firebase
    return gameRef.update(updates);
}).then(async () => {
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

    if (currentTopicCell) {
        drawConnectionLine(currentTopicCell, selectedCell);
    }

    console.log(`Filled cell at row ${selectedCell.dataset.row}, col ${selectedCell.dataset.col} with article: ${articleTitle}`);
    selectedCell = null;
    input.value = '';
}).catch((error) => {
    console.error('Error updating game state:', error);
    showPopup('Error updating game state. Please try again.');
});
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