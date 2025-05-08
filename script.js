// Initialize Firebase using the global firebase object (from CDN)
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
  
  // Initialize Firebase Authentication
  const auth = firebase.auth();

  // Initialize Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();

  // Initialize Firestore
const db = firebase.firestore();

// Initialize Firebase Analytics
const analytics = firebase.analytics();

  // Track the current user
let currentUser = null;

// Listen for authentication state changes
auth.onAuthStateChanged(user => {
    currentUser = user;
    console.log('Auth state changed: currentUser =', user ? user.email : 'null');
});

// Generate a unique identifier for anonymous users
function generateUniqueId() {
    return crypto.randomUUID();
}
const svg = document.getElementById('main-svg');
const input = document.getElementById('connection-input');
const gameWindow = document.getElementById('game-window');

// Create groups for lines and blocks to control rendering order
const lineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
lineGroup.setAttribute('id', 'line-group');
const blockGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
blockGroup.setAttribute('id', 'block-group');

// Append groups to SVG
svg.appendChild(lineGroup);
svg.appendChild(blockGroup);


// Global game variables
let allBlocks = [];
let usedAngles = [];
let totalScore = 0;
let lastBlockPoints = 0;
let topicBlock = null;
let gameCsvData = [];
let movableBlock = null; // For tracking the block being dragged
let initialBlock = null; // Reference to the initial block

// Canvas dragging variables
let isDragging = false;
let startX, startY;
let viewBox = { minX: 0, minY: 0, width: 10000, height: 10000 };

// Fetch topics from Firestore
let topicsByIndex = []; // Array indexed by the 'index' field
async function loadTopics() {
    try {
        const snapshot = await db.collection('topics')
            .orderBy('index', 'asc')
            .get();
        // Filter documents to ensure they have a name field and a valid index
        const topicDocs = snapshot.docs.filter(doc => {
            const data = doc.data();
            const hasName = data.name && typeof data.name === 'string' && data.name.trim() !== '';
            const hasValidIndex = Number.isInteger(data.index) && data.index >= 0;
            if (!hasName || !hasValidIndex) {
                console.warn(`Invalid topic document: ${doc.id}, data:`, data);
                return false;
            }
            return true;
        });
        // Store topics in an array indexed by their 'index' field
        topicsByIndex = [];
        topicDocs.forEach(doc => {
            const data = doc.data();
            topicsByIndex[data.index] = data.name;
        });
        // Log all topics with their indices
        const topicList = topicDocs.map(doc => ({ index: doc.data().index, name: doc.data().name }));
        console.log('Topics loaded from Firestore:', topicList);
        // Find the highest index for cycling
        const maxIndex = Math.max(...topicDocs.map(doc => doc.data().index), 0);
        console.log('Highest index in topics:', maxIndex);
        // Ensure topics array is not empty
        if (topicDocs.length === 0) {
            console.warn('No valid topics found in Firestore, using fallback');
            topicsByIndex[0] = "Photosynthesis";
        }
    } catch (error) {
        console.error('Error loading topics from Firestore:', error);
        // Fallback to a default topic if Firestore fails
        topicsByIndex[0] = "Photosynthesis";
    }
}

// Function to calculate the day of the year (1 to 365/366)
function getDayOfYear(date) {
    const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const diff = date - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24; // Milliseconds in a day
    const dayOfYear = Math.floor(diff / oneDay) + 1; // Add 1 to make it 1-based (Jan 1 = 1)
    console.log(`Day of the year: ${dayOfYear}`);
    return dayOfYear;
}

// Function to get the daily topic
async function getDailyTopic() {
    // Ensure topics are loaded
    if (topicsByIndex.length === 0) {
        await loadTopics();
    }

    const now = new Date();
    const dayOfYear = getDayOfYear(now); // Get the day of the year (1 to 365/366)
    
    // Use the day of the year to select a topic index
    let topicIndex = dayOfYear - 1; // Subtract 1 to make it 0-based for indexing
    let topicName = topicsByIndex[topicIndex];
    
    // If no topic exists for the exact index, cycle through the available indices
    if (!topicName) {
        // Find the highest index with a topic
        const maxIndex = topicsByIndex.reduce((max, topic, idx) => topic ? Math.max(max, idx) : max, 0);
        if (maxIndex === 0 && !topicsByIndex[0]) {
            console.warn('No topics available, using fallback');
            topicName = "Photosynthesis";
            topicIndex = 0;
        } else {
            topicIndex = topicIndex % (maxIndex + 1);
            topicName = topicsByIndex[topicIndex];
            if (!topicName) {
                // If still no topic, find the nearest lower index with a topic
                for (let i = topicIndex; i >= 0; i--) {
                    if (topicsByIndex[i]) {
                        topicIndex = i;
                        topicName = topicsByIndex[i];
                        break;
                    }
                }
                // If no topic found, use the first available topic
                if (!topicName) {
                    for (let i = 0; i <= maxIndex; i++) {
                        if (topicsByIndex[i]) {
                            topicIndex = i;
                            topicName = topicsByIndex[i];
                            break;
                        }
                    }
                }
            }
        }
    }
    
    console.log(`Selected topic for index ${topicIndex}: ${topicName}`);

    // Match the topic name to its Wikipedia article title
    try {
        const wikiTitle = await getWikipediaArticleTitle(topicName);
        if (!wikiTitle) {
            console.error(`No matching Wikipedia article found for topic: ${topicName}`);
            return "Photosynthesis"; // Fallback to a default topic
        }
        console.log(`Wikipedia article title for ${topicName}: ${wikiTitle}`);
        return wikiTitle;
    } catch (error) {
        console.error(`Error matching Wikipedia article for ${topicName}:`, error);
        return "Photosynthesis"; // Fallback to a default topic
    }
}
// Set the initial topic for the game
let dailyTopic;
getDailyTopic().then(topic => {
    dailyTopic = topic;
    console.log('Daily topic:', dailyTopic);

    // Clear allBlocks to ensure we start fresh
    allBlocks = [];
    console.log('After clearing allBlocks at start, allBlocks.length:', allBlocks.length);

    // Initialize game CSV data with the daily topic
    gameCsvData = [{ article: dailyTopic, ratio: 1, pointsEarned: 0, views: 0 }];

    // Create the initial block with the daily topic
    const initialBlockLocal = createNewBlock(dailyTopic);
    topicBlock = initialBlockLocal; // Set as the selected block
    initialBlock = initialBlockLocal; // Store reference to initial block
    allBlocks.push(initialBlockLocal);
    blockGroup.appendChild(initialBlockLocal);
    console.log('After adding initial block, allBlocks.length:', allBlocks.length);

    // Apply hover effect to the initial block
    addHoverEffect(initialBlockLocal);

    // Display the main image for the initial block (initial selection)
    displayMainImage(dailyTopic);

    // Log game start event
    analytics.logEvent('game_start', {
        initial_block: dailyTopic,
        user_id: currentUser ? currentUser.uid : 'anonymous'
    });

    // Set up click handler for the initial block
    initialBlockLocal.addEventListener('click', () => {
        // Only update if the clicked block is not already the selected topicBlock
        if (topicBlock !== initialBlockLocal) {
            topicBlock = initialBlockLocal;
            updateBlockStrokes();
            viewBox.minX = 5000 - viewBox.width / 2;
            viewBox.minY = 5000 - viewBox.height / 2;
            updateViewBox();
            displayMainImage(initialBlockLocal.querySelector('text').textContent);
        }
    });
}).catch(error => {
    console.error('Error setting daily topic:', error);
    // Fallback to a default topic if loading fails
    dailyTopic = "Photosynthesis";
    // Clear allBlocks to ensure we start fresh
    allBlocks = [];
    console.log('After clearing allBlocks at start (catch), allBlocks.length:', allBlocks.length);
    gameCsvData = [{ article: dailyTopic, ratio: 1, pointsEarned: 0, views: 0 }];
    const initialBlockLocal = createNewBlock(dailyTopic);
    topicBlock = initialBlockLocal; // Set as the selected block
    initialBlock = initialBlockLocal; // Store reference to initial block
    allBlocks.push(initialBlockLocal);
    blockGroup.appendChild(initialBlockLocal);
    console.log('After adding initial block (catch), allBlocks.length:', allBlocks.length);

    // Apply hover effect to the initial block
    addHoverEffect(initialBlockLocal);

    // Display the main image for the initial block (initial selection)
    displayMainImage(dailyTopic);

    // Log game start event
    analytics.logEvent('game_start', {
        initial_block: dailyTopic,
        user_id: currentUser ? currentUser.uid : 'anonymous'
    });

    // Set up click handler for the initial block
    initialBlockLocal.addEventListener('click', () => {
        // Only update if the clicked block is not already the selected topicBlock
        if (topicBlock !== initialBlockLocal) {
            topicBlock = initialBlockLocal;
            updateBlockStrokes();
            viewBox.minX = 5000 - viewBox.width / 2;
            viewBox.minY = 5000 - viewBox.height / 2;
            updateViewBox();
            displayMainImage(initialBlockLocal.querySelector('text').textContent);
        }
    });
});


// Block properties
const initialWidth = 1243;
const initialHeight = 477;

// Function to add hover effect
function addHoverEffect(block) {
    block.addEventListener('mouseover', () => {
        const scaleGroup = block.querySelector('#scale-group');
        const width = parseFloat(block.getAttribute('width'));
        const height = parseFloat(block.getAttribute('height'));
        const cx = width / 2;
        const cy = height / 2;
        scaleGroup.setAttribute('transform', `translate(${cx}, ${cy}) scale(1.1) translate(${-cx}, ${-cy})`);
    });
    block.addEventListener('mouseout', () => {
        const scaleGroup = block.querySelector('#scale-group');
        scaleGroup.setAttribute('transform', '');
    });
}


// Function to update the SVG viewBox
function updateViewBox() {
    svg.setAttribute('viewBox', `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`);
}

// Function to update stroke colors
function updateBlockStrokes() {
    allBlocks.forEach(b => {
        const path = b.querySelector('path');
        path.setAttribute('stroke', b === topicBlock ? '#6273B4' : '#000000');
    });
}
// Function to count blocks directly connected to the initial block
function countBlocksConnectedToInitial() {
    if (!initialBlock) {
        console.warn('Initial block not set');
        return 0;
    }
    const lines = lineGroup.querySelectorAll('line');
    let connectedBlocks = new Set();
    lines.forEach(line => {
        if (line.block1 === initialBlock && line.block2 !== initialBlock) {
            connectedBlocks.add(line.block2);
        } else if (line.block2 === initialBlock && line.block1 !== initialBlock) {
            connectedBlocks.add(line.block1);
        }
    });
    const count = connectedBlocks.size;
    console.log(`Number of blocks directly connected to initial block: ${count}`);
    return count;
}
// Function to recalculate ranks for all game sessions with the same initialBlock
async function recalculateRanks(initialBlockTitle) {
    try {
        // Fetch all game sessions with the same initialBlock
        const sessionsSnapshot = await db.collection('gameSessions')
            .where('initialBlock', '==', initialBlockTitle)
            .get();

        // Collect all sessions with their scores and IDs
        const sessions = [];
        sessionsSnapshot.forEach(doc => {
            const data = doc.data();
            sessions.push({
                id: doc.id,
                score: data.score,
                rank: data.rank,
                totalEntriesForTopic: data.totalEntriesForTopic
            });
        });

        // Sort sessions by score in descending order
        sessions.sort((a, b) => b.score - a.score);

        // Recalculate ranks
        const totalEntries = sessions.length;
        let currentRank = 1;
        let previousScore = null;

        for (let i = 0; i < sessions.length; i++) {
            const session = sessions[i];
            // If the score is different from the previous one, update the rank
            if (previousScore !== session.score) {
                currentRank = i + 1;
            }
            // Update the session in Firestore with the new rank and totalEntriesForTopic
            await db.collection('gameSessions').doc(session.id).update({
                rank: currentRank,
                totalEntriesForTopic: totalEntries
            });
            console.log(`Updated session ${session.id}: score=${session.score}, rank=${currentRank}, totalEntries=${totalEntries}`);
            previousScore = session.score;
        }

        console.log(`Recalculated ranks for topic "${initialBlockTitle}": ${totalEntries} sessions updated`);
    } catch (error) {
        console.error('Error recalculating ranks:', error);
    }
}
// Global mousemove handler to move blocks that are following the mouse
svg.addEventListener('mousemove', (e) => {
    if (!movableBlock || !movableBlock.isFollowingMouse) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    const blockWidth = parseFloat(movableBlock.getAttribute('width'));
    const blockHeight = parseFloat(movableBlock.getAttribute('height'));
    const newX = svgPt.x - blockWidth / 2;
    const newY = svgPt.y - blockHeight / 2;
    movableBlock.setAttribute('x', newX);
    movableBlock.setAttribute('y', newY);
    updateConnectedLines(movableBlock);
});

// Function to check if an angle is within any excluded range
function isAngleExcluded(angle) {
    angle = ((angle % 360) + 360) % 360;
    for (const usedAngle of usedAngles) {
        const minExcluded = ((usedAngle - 2) % 360 + 360) % 360;
        const maxExcluded = ((usedAngle + 2) % 360 + 360) % 360;
        if (minExcluded <= maxExcluded) {
            if (angle >= minExcluded && angle <= maxExcluded) {
                return true;
            }
        } else {
            if (angle >= minExcluded || angle <= maxExcluded) {
                return true;
            }
        }
    }
    return false;
}

// Function to get a valid random angle
function getValidAngle() {
    let angle;
    let attempts = 0;
    const maxAttempts = 100;

    do {
        angle = Math.random() * 360;
        attempts++;
        if (attempts > maxAttempts) {
            return null;
        }
    } while (isAngleExcluded(angle));

    return angle;
}

// Function to get node coordinates for a Block
function getBlockNodes(block) {
    const x = parseFloat(block.getAttribute('x'));
    const y = parseFloat(block.getAttribute('y'));
    const width = parseFloat(block.getAttribute('width'));
    const height = parseFloat(block.getAttribute('height'));
    return {
        top: { x: x + width / 2, y: y + (0.11 * height) },
        right: { x: x + width, y: y + height / 2 },
        bottom: { x: x + width / 2, y: y + (height - (0.11 * height)) },
        left: { x: x, y: y + height / 2 }
    };
}

// Function to find closest node pair between two Blocks
function findClosestNodes(block1, block2) {
    const nodes1 = getBlockNodes(block1);
    const nodes2 = getBlockNodes(block2);
    let minDistance = Infinity;
    let closestPair = null;

    const nodeNames = ['top', 'right', 'bottom', 'left'];
    for (const n1 of nodeNames) {
        for (const n2 of nodeNames) {
            const dx = nodes1[n1].x - nodes2[n2].x;
            const dy = nodes1[n1].y - nodes2[n2].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
                minDistance = distance;
                closestPair = { start: nodes1[n1], end: nodes2[n2] };
            }
        }
    }
    return closestPair;
}

// Function to create a connection line
function createConnectionLine(start, end) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', end.x);
    line.setAttribute('y2', end.y);
    line.setAttribute('stroke', '#000000');
    line.setAttribute('stroke-width', '20.625');
    line.setAttribute('stroke-linecap', 'butt');
    line.setAttribute('stroke-linejoin', 'miter');
    line.setAttribute('stroke-miterlimit', '8');
    line.setAttribute('stroke-opacity', '1');
    return line;
}

// Function to check if two Blocks overlap, accounting for hover scale
function checkOverlap(block1, block2) {
    const scaleFactor = 1.1;
    const x1 = parseFloat(block1.getAttribute('x'));
    const y1 = parseFloat(block1.getAttribute('y'));
    const w1 = parseFloat(block1.getAttribute('width')) * scaleFactor;
    const h1 = parseFloat(block1.getAttribute('height')) * scaleFactor;
    const x2 = parseFloat(block2.getAttribute('x'));
    const y2 = parseFloat(block2.getAttribute('y'));
    const w2 = parseFloat(block2.getAttribute('width')) * scaleFactor;
    const h2 = parseFloat(block2.getAttribute('height')) * scaleFactor;

    const offsetX1 = (w1 - parseFloat(block1.getAttribute('width'))) / 2;
    const offsetY1 = (h1 - parseFloat(block1.getAttribute('height'))) / 2;
    const offsetX2 = (w2 - parseFloat(block2.getAttribute('width'))) / 2;
    const offsetY2 = (h2 - parseFloat(block2.getAttribute('height'))) / 2;

    return !(
        (x1 + w1 - offsetX1) < (x2 - offsetX2) ||
        (x2 + w2 - offsetX2) < (x1 - offsetX1) ||
        (y1 + h1 - offsetY1) < (y2 - offsetY2) ||
        (y2 + h2 - offsetY2) < (y1 - offsetY1)
    );
}

// Function to check if a block overlaps with any connection line, accounting for hover scale
function checkLineOverlap(block) {
    const scaleFactor = 1.1;
    const x = parseFloat(block.getAttribute('x'));
    const y = parseFloat(block.getAttribute('y'));
    const width = parseFloat(block.getAttribute('width')) * scaleFactor;
    const height = parseFloat(block.getAttribute('height')) * scaleFactor;
    const offsetX = (width - parseFloat(block.getAttribute('width'))) / 2;
    const offsetY = (height - parseFloat(block.getAttribute('height'))) / 2;
    const blockRect = {
        left: x - offsetX,
        right: x + width - offsetX,
        top: y - offsetY,
        bottom: y + height - offsetY
    };

    const lines = lineGroup.querySelectorAll('line');
    const strokeWidth = 20.625;
    const buffer = strokeWidth + 20;

    for (const line of lines) {
        const x1 = parseFloat(line.getAttribute('x1'));
        const y1 = parseFloat(line.getAttribute('y1'));
        const x2 = parseFloat(line.getAttribute('x2'));
        const y2 = parseFloat(line.getAttribute('y2'));

        const expandedRect = {
            left: blockRect.left - buffer,
            right: blockRect.right + buffer,
            top: blockRect.top - buffer,
            bottom: blockRect.bottom + buffer
        };

        const lineMinX = Math.min(x1, x2);
        const lineMaxX = Math.max(x1, x2);
        const lineMinY = Math.min(y1, y2);
        const lineMaxY = Math.max(y1, y2);

        if (
            expandedRect.right < lineMinX ||
            expandedRect.left > lineMaxX ||
            expandedRect.bottom < lineMinY ||
            expandedRect.top > lineMaxY
        ) {
            continue;
        }

        const edges = [
            { x1: expandedRect.left, y1: expandedRect.top, x2: expandedRect.right, y2: expandedRect.top },
            { x1: expandedRect.right, y1: expandedRect.top, x2: expandedRect.right, y2: expandedRect.bottom },
            { x1: expandedRect.right, y1: expandedRect.bottom, x2: expandedRect.left, y2: expandedRect.bottom },
            { x1: expandedRect.left, y1: expandedRect.bottom, x2: expandedRect.left, y2: expandedRect.top }
        ];

        for (const edge of edges) {
            const denom = (x2 - x1) * (edge.y2 - edge.y1) - (y2 - y1) * (edge.x2 - edge.x1);
            if (denom === 0) continue;

            const t = ((edge.x1 - x1) * (edge.y2 - edge.y1) - (edge.y1 - y1) * (edge.x2 - edge.x1)) / denom;
            const u = ((edge.x1 - x1) * (y2 - y1) - (edge.y1 - y1) * (x2 - x1)) / denom;

            if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
                return true;
            }
        }

        if (
            (x1 >= expandedRect.left && x1 <= expandedRect.right && y1 >= expandedRect.top && y1 <= expandedRect.bottom) ||
            (x2 >= expandedRect.left && x2 <= expandedRect.right && y2 >= expandedRect.top && y2 <= expandedRect.bottom)
        ) {
            return true;
        }
    }
    return false;
}

// Function to show a popup message
function showPopup(message) {
    const popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#fff';
    popup.style.border = '2px solid #6273B4';
    popup.style.padding = '20px';
    popup.style.borderRadius = '10px';
    popup.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    popup.style.zIndex = '1000';
    popup.style.fontFamily = 'Arial, sans-serif';
    popup.style.fontSize = '16px';
    popup.style.textAlign = 'center';
    popup.textContent = message;

    document.body.appendChild(popup);

    setTimeout(() => {
        popup.remove();
    }, 2000);
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
        analytics.logEvent('error', {
            action: 'fetch_wikipedia_article',
            error_message: error.message,
            search_term: searchTerm
        });
        return null;
    }
}
// gets image for each block 
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
// get average views for each articel 
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
            return averageMonthlyViews.toLocaleString(); // Format with commas
        }
        console.log(`No view data for "${articleTitle}"`);
        return 'N/A';
    } catch (error) {
        console.error(`Error fetching views for "${articleTitle}":`, error);
        return 'N/A';
    }
}
function generateCsvContent() {
    const headers = 'Article Name,Ratio,Points Earned,Average Monthly Views\n';
    const rows = gameCsvData.map(data => 
        `"${data.article.replace(/"/g, '""')}","${data.ratio}","${data.pointsEarned}","${data.views}"`
    ).join('\n');
    return headers + rows;
}

function updateConnectedLines(block) {
    // Find all lines connected to this block using stored references
    const lines = lineGroup.querySelectorAll('line');
    const blockLines = Array.from(lines).filter(line => line.block1 === block || line.block2 === block);

    // Update each connected line
    blockLines.forEach(line => {
        const block1 = line.block1;
        const block2 = line.block2;
        if (!block1 || !block2) return; // Skip if references are missing

        // Recalculate closest nodes between the two blocks
        const closestNodes = findClosestNodes(block1, block2);
        if (closestNodes) {
            line.setAttribute('x1', closestNodes.start.x);
            line.setAttribute('y1', closestNodes.start.y);
            line.setAttribute('x2', closestNodes.end.x);
            line.setAttribute('y2', closestNodes.end.y);
            console.log(`Updated line between ${block1.querySelector('text').textContent} and ${block2.querySelector('text').textContent}`);
        }
    });
}

async function resetGame() {
    // Clear all blocks and lines
    allBlocks.length = 0;
    console.log('After clearing allBlocks, allBlocks.length:', allBlocks.length);
    
    // Remove all blocks and lines from SVG
    blockGroup.innerHTML = '';
    lineGroup.innerHTML = '';
    
    // Reset used angles and scoring data
    usedAngles = [];
    totalScore = 0;
    lastBlockPoints = 0;
    
    // Reset CSV with the current daily topic
    gameCsvData = [{ article: dailyTopic, ratio: 1, pointsEarned: 0, views: 0 }];
    
    // Temporarily set topicBlock to null to prevent line creation for the initial block
    const previousTopicBlock = topicBlock;
    topicBlock = null;

    // Create a new initial block with the daily topic
    const initialBlockLocal = createNewBlock(dailyTopic);
    blockGroup.appendChild(initialBlockLocal);
    allBlocks.push(initialBlockLocal);
    console.log('After adding initial block in resetGame, allBlocks.length:', allBlocks.length);
    topicBlock = initialBlockLocal; // Ensure the initial block is selected
    initialBlock = initialBlockLocal; // Update reference to initial block
    
    // Reset follow-mouse state
    initialBlockLocal.isFollowingMouse = false;
    movableBlock = null;
     
    // Update block strokes to reflect the selected state
    updateBlockStrokes();

    // Update initial block views and display
    const viewsStr = await fetchAverageMonthlyViews(dailyTopic);
    const views = viewsStr !== 'N/A' ? parseFloat(viewsStr.replace(/,/g, '')) : 0;
    gameCsvData[0].views = views;
    console.log('Game reset, CSV initialized:', generateCsvContent());
    displayMainImage(initialBlockLocal.querySelector('text').textContent, 0);

    // Debug: Check if any lines exist after reset
    const linesAfterReset = lineGroup.querySelectorAll('line');
    console.log('Lines after reset:', linesAfterReset.length, linesAfterReset);

    // Log game start event after reset
    analytics.logEvent('game_start', {
        initial_block: dailyTopic,
        user_id: currentUser ? currentUser.uid : 'anonymous'
    });

    // Show the text input box
    input.style.display = 'block';
    console.log('Game reset: Text input box shown');
}
// Function to display the main image in the game window and adds views 
async function displayMainImage(articleTitle) {
    // Set game window styles for consistent width and uniform x-axis padding
    gameWindow.style.width = '300px';
    gameWindow.style.paddingLeft = '2%';
    gameWindow.style.paddingRight = '2%';
    gameWindow.style.paddingTop = '10px';
    gameWindow.style.paddingBottom = '10px';
    gameWindow.style.boxSizing = 'border-box';
    gameWindow.style.margin = '0 auto';

    gameWindow.innerHTML = '';

    const imageUrl = await fetchMainImage(articleTitle);
    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = `${articleTitle} main image`;
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

    // Add monthly views text
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
    viewsSpan.textContent = await fetchAverageMonthlyViews(articleTitle);
    
    viewsText.appendChild(viewsLabelSpan);
    viewsText.appendChild(viewsSpan);
    gameWindow.appendChild(viewsText);

    // Add points earned text
    const pointsEarned = gameCsvData.find(data => data.article === articleTitle)?.pointsEarned || 0;
    const pointsText = document.createElement('p');
    pointsText.style.textAlign = 'center';
    pointsText.style.margin = '10px 0 0 0';
    pointsText.style.fontFamily = 'Arial, sans-serif';
    pointsText.style.fontSize = '14px';
    
    const pointsLabelSpan = document.createElement('span');
    pointsLabelSpan.textContent = 'Points Earned: ';
    pointsLabelSpan.style.color = '#000000';
    
    const pointsSpan = document.createElement('span');
    pointsSpan.style.color = '#6273B4';
    pointsSpan.textContent = pointsEarned.toString();
    
    pointsText.appendChild(pointsLabelSpan);
    pointsText.appendChild(pointsSpan);
    gameWindow.appendChild(pointsText);

    // Add score text
    const scoreText = document.createElement('p');
    scoreText.style.textAlign = 'center';
    scoreText.style.margin = '10px 0 0 0';
    scoreText.style.fontFamily = 'Arial, sans-serif';
    scoreText.style.fontSize = '14px';
    
    const scoreLabelSpan = document.createElement('span');
    scoreLabelSpan.textContent = 'Score: ';
    scoreLabelSpan.style.color = '#000000';
    
    const scoreSpan = document.createElement('span');
    scoreSpan.style.color = '#6273B4';
    scoreSpan.textContent = totalScore.toString();
    
    scoreText.appendChild(scoreLabelSpan);
    scoreText.appendChild(scoreSpan);
    gameWindow.appendChild(scoreText);

    // Add blocks left text
    const blocksLeft = 11 - allBlocks.length;
    const blocksText = document.createElement('p');
    blocksText.style.textAlign = 'center';
    blocksText.style.margin = '10px 0 0 0';
    blocksText.style.fontFamily = 'Arial, sans-serif';
    blocksText.style.fontSize = '14px';
    
    const blocksLabelSpan = document.createElement('span');
    blocksLabelSpan.textContent = 'Blocks Left: ';
    blocksLabelSpan.style.color = '#000000';
    
    const blocksSpan = document.createElement('span');
    blocksSpan.style.color = '#6273B4';
    blocksSpan.textContent = blocksLeft.toString();
    
    blocksText.appendChild(blocksLabelSpan);
    blocksText.appendChild(blocksSpan);
    gameWindow.appendChild(blocksText);

    // Add "Visit Article" button if game is over
    if (allBlocks.length === 11) {
        const visitButton = document.createElement('button');
        visitButton.textContent = 'Visit Article';
        visitButton.style.backgroundColor = '#6273B4';
        visitButton.style.color = '#fff';
        visitButton.style.border = 'none';
        visitButton.style.padding = '10px 20px';
        visitButton.style.borderRadius = '5px';
        visitButton.style.cursor = 'pointer';
        visitButton.style.display = 'block';
        visitButton.style.margin = '15px auto 0 auto'; // Centered, 15px top margin
        visitButton.style.fontFamily = 'Arial, sans-serif';
        visitButton.style.fontSize = '14px';
        visitButton.addEventListener('click', () => {
            const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(articleTitle.replace(/\s+/g, '_'))}`;
            window.open(wikiUrl, '_blank');
          // Log game complete event
        analytics.logEvent('game_complete', {
        score: totalScore,
        initial_block: initialBlockTitle,
        user_id: currentUser ? currentUser.uid : userIdentifier
});  
        });
        gameWindow.appendChild(visitButton);
    }
}
// Function to fetch wikitext and check for hyperlinks bidirectionally
async function checkWikitextForLink(subjectTitle, topicTitle) {
    const subjectUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(subjectTitle)}&prop=wikitext&format=json&origin=*`;
    const topicUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(topicTitle)}&prop=wikitext&format=json&origin=*`;
    let hyperlinks = [];

    function extractHyperlinks(wikitext, articleTitle) {
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
            subjectLinks = extractHyperlinks(subjectWikitext, subjectTitle);
        } else {
            console.error('Subject API error:', subjectData.error);
        }

        let topicLinks = [];
        const topicResponse = await fetch(topicUrl);
        const topicData = await topicResponse.json();
        if (!topicData.error) {
            const topicWikitext = topicData.parse.wikitext['*'];
            topicLinks = extractHyperlinks(topicWikitext, topicTitle);
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

// Function to create a new Block
function createNewBlock(text) {
    const charWidth = 110;
    const textWidth = text.length * charWidth;
    const padding = 300;
    const newWidth = Math.max(initialWidth, (textWidth + padding) * 1.1);

    const newBlock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    newBlock.setAttribute('width', newWidth);
    newBlock.setAttribute('height', initialHeight);
    newBlock.setAttribute('overflow', 'visible');

    const scaleGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    scaleGroup.setAttribute('id', 'scale-group');

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(-2717 -2305)');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const originalRightX = 3874.17;
    const widthIncrease = newWidth - initialWidth;
    const newRightX = originalRightX + widthIncrease;
    const pathD = `M2740.5 2388.83C2740.5 2353.86 2768.86 2325.5 2803.83 2325.5L${newRightX} 2325.5C${newRightX + 34.97} 2325.5 ${newRightX + 63.33} 2353.86 ${newRightX + 63.33} 2388.83L${newRightX + 63.33} 2642.17C${newRightX + 63.33} 2677.14 ${newRightX + 34.97} 2705.5 ${newRightX} 2705.5L2803.83 2705.5C2768.86 2705.5 2740.5 2677.14 2740.5 2642.17Z`;
    path.setAttribute('d', pathD);
    path.setAttribute('stroke', '#000000');
    path.setAttribute('stroke-width', '38.9583');
    path.setAttribute('stroke-linecap', 'butt');
    path.setAttribute('stroke-linejoin', 'miter');
    path.setAttribute('stroke-miterlimit', '8');
    path.setAttribute('stroke-opacity', '1');
    path.setAttribute('fill', '#FFFFFF');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('fill-opacity', '1');

    const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElement.setAttribute('class', 'no-select');
    textElement.setAttribute('fill', '#000000');
    textElement.setAttribute('fill-opacity', '1');
    textElement.setAttribute('font-family', 'American Typewriter,American Typewriter_MSFontService,sans-serif');
    textElement.setAttribute('font-size', '220');
    textElement.setAttribute('text-anchor', 'middle');
    textElement.setAttribute('transform', `matrix(1 0 0 1 ${(2803.83 + newRightX) / 2} 2590)`);
    textElement.textContent = text;

    g.appendChild(path);
    g.appendChild(textElement);
    scaleGroup.appendChild(g);
    newBlock.appendChild(scaleGroup);

    let newCenterX, newCenterY;

    if (!topicBlock) {
        // This is the initial block; place it at the center of the SVG
        newCenterX = 5000; // Center of 10000x10000 viewBox
        newCenterY = 5000;
        newBlock.setAttribute('x', newCenterX - newWidth / 2);
        newBlock.setAttribute('y', newCenterY - initialHeight / 2);
    } else {
        // Position the new block relative to topicBlock
        const topicX = parseFloat(topicBlock.getAttribute('x')) + parseFloat(topicBlock.getAttribute('width')) / 2;
        const topicY = parseFloat(topicBlock.getAttribute('y')) + initialHeight / 2;
        let pr = 0.1 + Math.random() * (0.4 - 0.1);
        let blockRadius = initialWidth / 2 + initialWidth + pr * initialWidth;

        let placed = false;
        let angle = null;

        for (let angleAttempts = 0; angleAttempts < 5 && !placed; angleAttempts++) {
            angle = getValidAngle();
            if (angle === null) continue;

            const angleRad = angle * (Math.PI / 180);
            const xComponent = blockRadius * Math.cos(angleRad);
            const yComponent = blockRadius * Math.sin(angleRad);
            newCenterX = topicX + xComponent;
            newCenterY = topicY + yComponent;

            newBlock.setAttribute('x', newCenterX - newWidth / 2);
            newBlock.setAttribute('y', newCenterY - initialHeight / 2);

            let overlaps = false;
            for (const existingBlock of allBlocks) {
                if (checkOverlap(newBlock, existingBlock)) {
                    overlaps = true;
                    break;
                }
            }
            if (!overlaps && checkLineOverlap(newBlock)) {
                overlaps = true;
            }

            if (!overlaps) {
                placed = true;
                usedAngles.push(angle);
            }
        }

        if (!placed) {
            for (let radiusAttempts = 0; radiusAttempts < 10 && !placed; radiusAttempts++) {
                blockRadius += initialWidth * 0.1;
                for (let angleAttempts = 0; angleAttempts < 5 && !placed; angleAttempts++) {
                    angle = getValidAngle();
                    if (angle === null) continue;

                    const angleRad = angle * (Math.PI / 180);
                    const xComponent = blockRadius * Math.cos(angleRad);
                    const yComponent = blockRadius * Math.sin(angleRad);
                    newCenterX = topicX + xComponent;
                    newCenterY = topicY + yComponent;

                    newBlock.setAttribute('x', newCenterX - newWidth / 2);
                    newBlock.setAttribute('y', newCenterY - initialHeight / 2);

                    let overlaps = false;
                    for (const existingBlock of allBlocks) {
                        if (checkOverlap(newBlock, existingBlock)) {
                            overlaps = true;
                            break;
                        }
                    }
                    if (!overlaps && checkLineOverlap(newBlock)) {
                        overlaps = true;
                    }

                    if (!overlaps) {
                        placed = true;
                        usedAngles.push(angle);
                    }
                }
            }
        }

        if (!placed) {
            console.warn('Could not find non-overlapping position; placing anyway.');
        }

        // Only create a connection line if topicBlock exists and is not the same as the new block
        if (topicBlock && topicBlock !== newBlock) {
            console.log(`Creating connection line between ${topicBlock.querySelector('text').textContent} and ${newBlock.querySelector('text').textContent}`);
            const closestNodes = findClosestNodes(topicBlock, newBlock);
            if (closestNodes) {
                const line = createConnectionLine(closestNodes.start, closestNodes.end);
                // Store references to the connected blocks on the line
                line.block1 = topicBlock;
                line.block2 = newBlock;
                lineGroup.appendChild(line);
            }
        } else {
            console.log(`Skipping line creation: topicBlock is ${topicBlock ? topicBlock.querySelector('text').textContent : 'null'}, newBlock is ${newBlock.querySelector('text').textContent}`);
        }
    }

    newBlock.addEventListener('click', () => {
        // Only update if the clicked block is not already the selected topicBlock
        if (topicBlock !== newBlock) {
            topicBlock = newBlock;
            updateBlockStrokes();
            // Calculate current center position based on block's x, y, width, and height
            const currentX = parseFloat(newBlock.getAttribute('x'));
            const currentY = parseFloat(newBlock.getAttribute('y'));
            const blockWidth = parseFloat(newBlock.getAttribute('width'));
            const blockHeight = parseFloat(newBlock.getAttribute('height'));
            const currentCenterX = currentX + blockWidth / 2;
            const currentCenterY = currentY + blockHeight / 2;
            viewBox.minX = currentCenterX - viewBox.width / 2;
            viewBox.minY = currentCenterY - viewBox.height / 2;
            updateViewBox();
            displayMainImage(textElement.textContent);
        }
    });

    // Add double-click to toggle follow-mouse state
    newBlock.isFollowingMouse = false; // Add a property to track the follow-mouse state
    newBlock.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        newBlock.isFollowingMouse = !newBlock.isFollowingMouse; // Toggle follow-mouse state
        const path = newBlock.querySelector('path');
        if (newBlock.isFollowingMouse) {
            // Start following mouse
            if (movableBlock && movableBlock !== newBlock) {
                // Stop the previous block from following the mouse
                movableBlock.isFollowingMouse = false;
                const prevPath = movableBlock.querySelector('path');
                prevPath.setAttribute('stroke', movableBlock === topicBlock ? '#6273B4' : '#000000');
            }
            movableBlock = newBlock;
            path.setAttribute('stroke', '#FFFF00'); // Yellow highlight to indicate following
            console.log(`${textElement.textContent} is now following the mouse`);
        } else {
            // Stop following mouse
            movableBlock = null;
            path.setAttribute('stroke', newBlock === topicBlock ? '#6273B4' : '#000000');
            console.log(`${textElement.textContent} position fixed`);
        }
    });

    newBlock.addEventListener('mousedown', (e) => e.stopPropagation());

    addHoverEffect(newBlock);

    blockGroup.appendChild(newBlock);
    updateBlockStrokes();

    return newBlock;
}




// Handle user input on Enter key
input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && input.value.trim() !== '') {
        const userInput = input.value.trim();
        input.value = '';

        const textElement = topicBlock.querySelector('text');
        if (!textElement) {
            console.error('No text element found in topicBlock');
            showPopup('Error: Could not determine topic. Try again.');
            return;
        }
        const topicText = textElement.textContent;
        console.log(`Processing input: ${userInput}, Topic: ${topicText}`);

        const subjectTitle = await getWikipediaArticleTitle(userInput);
        if (!subjectTitle) {
            showPopup('No matching Wikipedia article found. Try again.');
            return;
        }

        // Check for duplicate article
        const isDuplicate = gameCsvData.some(data => data.article.toLowerCase() === subjectTitle.toLowerCase());
        if (isDuplicate) {
            showPopup('Answer has already been added');
            return;
        }

        // Check if the article title starts with "List" (case-insensitive)
        if (subjectTitle.toLowerCase().startsWith('list')) {
            showPopup('List Articles cannot create a new Block');
            return;
        }

        const hasLink = await checkWikitextForLink(subjectTitle, topicText);
        if (!hasLink) {
            showPopup('Input does not match. Try again.');
            return;
        }

        // Calculate Ratio and score
        const subjectViewsStr = await fetchAverageMonthlyViews(subjectTitle);
        const topicViewsStr = await fetchAverageMonthlyViews(topicText);
        let points = 0;
        let baseRatio = 0;
        let adjustedRatio = 0;
        if (subjectViewsStr !== 'N/A' && topicViewsStr !== 'N/A') {
            const subjectViews = parseFloat(subjectViewsStr.replace(/,/g, ''));
            const topicViews = parseFloat(topicViewsStr.replace(/,/g, ''));
            if (topicViews > 0) {
                baseRatio = subjectViews / topicViews;
                // Get topic block’s Ratio from gameCsvData
                const topicData = gameCsvData.find(data => data.article === topicText);
                const topicRatio = topicData ? topicData.ratio : 1; // Default to 1 if not found
                // Conditionally adjust the ratio based on the previous block's ratio
                if (topicRatio > 1) {
                    adjustedRatio = baseRatio; // Do not multiply if previous ratio is greater than 1
                    console.log(`Previous ratio ${topicRatio} > 1, using base ratio: ${baseRatio}`);
                } else {
                    adjustedRatio = baseRatio * topicRatio; // Multiply if previous ratio is <= 1
                    console.log(`Previous ratio ${topicRatio} <= 1, multiplying: Base Ratio=${baseRatio}, Topic Ratio=${topicRatio}, Adjusted Ratio=${adjustedRatio}`);
                }
                
                // Award points based on adjusted Ratio
                if (adjustedRatio > 1) points = 1;
                else if (adjustedRatio > 0.95) points = 2;
                else if (adjustedRatio > 0.90) points = 3;
                else if (adjustedRatio > 0.85) points = 4;
                else if (adjustedRatio > 0.80) points = 5;
                else if (adjustedRatio > 0.75) points = 7;
                else if (adjustedRatio > 0.70) points = 9;
                else if (adjustedRatio > 0.65) points = 12;
                else if (adjustedRatio > 0.60) points = 15;
                else if (adjustedRatio > 0.55) points = 19;
                else if (adjustedRatio > 0.50) points = 23;
                else if (adjustedRatio > 0.45) points = 27;
                else if (adjustedRatio > 0.40) points = 32;
                else if (adjustedRatio > 0.35) points = 37;
                else if (adjustedRatio > 0.30) points = 43;
                else if (adjustedRatio > 0.25) points = 48;
                else if (adjustedRatio > 0.20) points = 55;
                else if (adjustedRatio > 0.15) points = 61;
                else if (adjustedRatio > 0.10) points = 68;
                else if (adjustedRatio > 0.05) points = 76;
                else if (adjustedRatio > 0.025) points = 83;
                else if (adjustedRatio > 0.01) points = 91;
                else if (adjustedRatio > 0) points = 100;
                
                totalScore += points;
                lastBlockPoints = points;
                console.log(`Points awarded: ${points}, Total Score: ${totalScore}, Last Block Points: ${lastBlockPoints}`);
            } else {
                console.log(`Topic views are zero for "${topicText}", no points awarded`);
                lastBlockPoints = 0;
            }
        } else {
            console.log(`No valid views data for ${subjectTitle} or ${topicText}, no points awarded`);
            lastBlockPoints = 0;
        }

        // Add block data to CSV
        const views = subjectViewsStr !== 'N/A' ? parseFloat(subjectViewsStr.replace(/,/g, '')) : 0;
        gameCsvData.push({
            article: subjectTitle,
            ratio: baseRatio || 0, // Store base Ratio
            pointsEarned: points,
            views: views
        });
        console.log('Updated CSV:', generateCsvContent());

        const newBlock = createNewBlock(subjectTitle);
        allBlocks.push(newBlock); // Add the new block to allBlocks
        // Update game window for new topic block
        displayMainImage(subjectTitle);

        // Check if block limit is reached
        if (allBlocks.length === 11) {
            // Hide the text input box
            input.style.display = 'none';
            console.log('Game over: Text input box hidden');

            // Generate a unique identifier for anonymous users
            const userIdentifier = currentUser ? currentUser.uid : generateUniqueId();
            const isAnonymous = !currentUser;
            const initialBlockTitle = gameCsvData[0].article; // Initial block title (e.g., "Wright brothers")
            // Calculate penalty for insufficient connections to initial block
            const connectedCount = countBlocksConnectedToInitial();
            let penaltyPoints = 0;
            if (connectedCount < 3) {
            const blocksUnderThreshold = 3 - connectedCount;
            penaltyPoints = blocksUnderThreshold * -100;
            console.log(`Applying penalty: ${penaltyPoints} points (${blocksUnderThreshold} blocks under threshold of 3)`);
        }

        const finalScore = totalScore + penaltyPoints;
            // Save game data to Firestore
            const gameData = {
                userIdentifier: userIdentifier,
                isAnonymous: isAnonymous,
                score: finalScore,
                initialBlock: initialBlockTitle,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            let gameSessionId;
            await db.collection('gameSessions').add(gameData)
                .then(docRef => {
                    gameSessionId = docRef.id;
                    console.log('Game session saved to Firestore with ID:', gameSessionId);
                })
                .catch(error => {
                    console.error('Error saving game session to Firestore:', error);
                });
                // Log game complete event with final score
    analytics.logEvent('game_complete', {
        score: finalScore,
        initial_block: initialBlockTitle,
        user_id: currentUser ? currentUser.uid : userIdentifier
    });
            // Recalculate ranks for all sessions with the same initialBlock
            await recalculateRanks(initialBlockTitle);

            const popup = document.createElement('div');
            popup.style.position = 'fixed';
            popup.style.top = '50%';
            popup.style.left = '50%';
            popup.style.transform = 'translate(-50%, -50%)';
            popup.style.backgroundColor = '#fff';
            popup.style.border = '2px solid #6273B4';
            popup.style.padding = '20px';
            popup.style.borderRadius = '10px';
            popup.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            popup.style.zIndex = '1000';
            popup.style.fontFamily = 'Arial, sans-serif';
            popup.style.fontSize = '16px';
            popup.style.textAlign = 'center';
            popup.style.transition = 'all 0.3s ease-in-out';

            const message = document.createElement('p');
            message.textContent = 'Game Over';
            message.style.margin = '0 0 10px 0';
            popup.appendChild(message);

        // Add total score before penalty
    const scoreText = document.createElement('p');
    scoreText.style.margin = '0 0 5px 0';
    scoreText.innerHTML = `Total Score: <span style="color: #6273B4;">${totalScore}</span>`;
    popup.appendChild(scoreText);

    // Add penalty points in red
    const penaltyText = document.createElement('p');
    penaltyText.style.margin = '0 0 5px 0';
    penaltyText.innerHTML = `Penalty Points: <span style="color: red;">${penaltyPoints}</span>`;
    popup.appendChild(penaltyText);

    // Add final score after penalty
    const finalScoreText = document.createElement('p');
    finalScoreText.style.margin = '0 0 5px 0';
    finalScoreText.innerHTML = `Final Score: <span style="color: #6273B4;">${finalScore}</span>`;
    popup.appendChild(finalScoreText);
            

            // Fetch the updated rank after recalculation
            let rank = 0;
            let totalEntriesForTopic = 0;
            await db.collection('gameSessions')
                .doc(gameSessionId)
                .get()
                .then(doc => {
                    if (doc.exists) {
                        rank = doc.data().rank || 'N/A';
                        totalEntriesForTopic = doc.data().totalEntriesForTopic || 'N/A';
                    }
                })
                .catch(error => {
                    console.error('Error fetching updated rank:', error);
                    rank = 'N/A';
                    totalEntriesForTopic = 'N/A';
                });

            const rankText = document.createElement('p');
            rankText.style.margin = '0 0 15px 0';
            rankText.innerHTML = `Your score ranks <span style="color: #6273B4;">${rank}</span> out of <span style="color: #6273B4;">${totalEntriesForTopic}</span> for this topic`;
            popup.appendChild(rankText);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'flex';
            buttonContainer.style.gap = '10px';
            buttonContainer.style.justifyContent = 'center';

            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset Game';
            resetButton.style.backgroundColor = '#6273B4';
            resetButton.style.color = '#fff';
            resetButton.style.border = 'none';
            resetButton.style.padding = '10px 20px';
            resetButton.style.borderRadius = '5px';
            resetButton.style.cursor = 'pointer';
            resetButton.addEventListener('click', async () => {
                await resetGame();
                popup.remove();
            });
            buttonContainer.appendChild(resetButton);

            const reviewButton = document.createElement('button');
            reviewButton.textContent = 'Review Game';
            reviewButton.style.backgroundColor = '#6273B4';
            reviewButton.style.color = '#fff';
            reviewButton.style.border = 'none';
            reviewButton.style.padding = '10px 20px';
            reviewButton.style.borderRadius = '5px';
            reviewButton.style.cursor = 'pointer';
            let isMinimized = false;

            const minimizePopup = () => {
                try {
                    popup.style.top = 'auto';
                    popup.style.bottom = '10px';
                    popup.style.left = '50%';
                    popup.style.transform = 'translateX(-50%)';
                    popup.style.width = '200px';
                    popup.style.padding = '10px';
                    popup.style.minHeight = 'auto';
                    message.textContent = 'Game Over - Click to Expand';
                    scoreText.style.display = 'none';
                    rankText.style.display = 'none';
                    buttonContainer.style.display = 'none';
                    isMinimized = true;
                    console.log('Popup minimized');
                } catch (error) {
                    console.error('Error minimizing popup:', error);
                }
            };

            const expandPopup = () => {
                try {
                    popup.style.top = '50%';
                    popup.style.bottom = 'auto';
                    popup.style.left = '50%';
                    popup.style.transform = 'translate(-50%, -50%)';
                    popup.style.width = 'auto';
                    popup.style.padding = '20px';
                    popup.style.minHeight = 'auto';
                    message.textContent = 'Game Over';
                    scoreText.style.display = 'block';
                    rankText.style.display = 'block';
                    buttonContainer.style.display = 'flex';
                    isMinimized = false;
                    console.log('Popup expanded');
                } catch (error) {
                    console.error('Error expanding popup:', error);
                }
            };

            reviewButton.addEventListener('click', minimizePopup);

            popup.addEventListener('click', (event) => {
                if (isMinimized && event.target === popup) {
                    expandPopup();
                }
            });

            buttonContainer.appendChild(reviewButton);
            popup.appendChild(buttonContainer);

            document.body.appendChild(popup);
        }
    }
});

// Handle banner button popups
document.getElementById('how-to-play-button').addEventListener('click', () => {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.innerHTML = `
        <p style="font-weight: bold; font-size: 18px; margin-bottom: 15px;">How to Play?</p>
        <ol style="text-align: left; padding-left: 20px; margin-bottom: 20px;">
            <li>Start with the given topic Block.</li>
            <li>Add new Blocks by typing a related topic in the text box and pressing Enter.</li>
            <li>The new topic must be linked to the topic Block's Wikipedia or vice versa.</li>
            <li>At Least 3 of your Blocks must be connected to the first Block or a penalty will be added.</li>
            <li>Add 10 Blocks to complete the game.</li>
            <li>The more niche the topic the more points you earn.</li>
            <li>For example, if the Topic Block is <span style="color: #6273B4;">New York City</span>, an acceptable answer would be <span style="color: #6273B4;"> The Empire State Buildng </span> or the <span style="color: #6273B4;">NYC Marathon</span>.</li>
            <li>Double click a Block to move it.</li>
        </ol>
        <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
    `;
    popup.querySelector('button').addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
});

document.getElementById('profile-button').addEventListener('click', () => {
    const popup = document.createElement('div');
    popup.className = 'popup';
    
    if (!currentUser) {
        // User is not signed in; show email/password fields and Google Sign-In button
        popup.innerHTML = `
            <p style="font-weight: bold; font-size: 18px; margin-bottom: 15px;">Profile</p>
            <div style="text-align: left; padding: 0 20px;">
                <label for="auth-email">Email:</label><br>
                <input type="email" id="auth-email" style="width: 100%; margin-bottom: 10px; padding: 5px;" placeholder="Enter your email"><br>
                <label for="auth-password">Password:</label><br>
                <input type="password" id="auth-password" style="width: 100%; margin-bottom: 15px; padding: 5px;" placeholder="Enter your password"><br>
            </div>
            <button id="google-signin-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;">Sign in with Google</button>
            <button id="signup-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-bottom: 10px;">Create Account</button>
            <button id="login-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-bottom: 10px; margin-left: 10px;">Log In</button>
            <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
        `;
        
        // Add event listener for Google Sign-In button
        popup.querySelector('#google-signin-button').addEventListener('click', () => {
            auth.signInWithPopup(googleProvider)
                .then(userCredential => {
                    console.log('User signed in with Google:', userCredential.user.email);
                    analytics.logEvent('sign_up', {
                        method: 'google',
                        user_id: userCredential.user.uid
                    });
                    popup.remove();
                })
                .catch(error => {
                    console.error('Google Sign-In error:', error.message);
                    analytics.logEvent('error', {
                        action: 'sign_in_google',
                        error_message: error.message
                    });
                    alert(`Error: ${error.message}`);
                });
        });

        // Add event listener for create account button
        popup.querySelector('#signup-button').addEventListener('click', () => {
            const email = popup.querySelector('#auth-email').value;
            const password = popup.querySelector('#auth-password').value;
            
            if (!email || !password) {
                alert('Please enter both email and password.');
                return;
            }
            
            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => {
                    console.log('User signed up:', userCredential.user.email);
                    analytics.logEvent('sign_up', {
                        method: 'email',
                        user_id: userCredential.user.uid
                    });
                    popup.remove();
                })
                .catch(error => {
                    console.error('Sign-up error:', error.message);
                    analytics.logEvent('error', {
                        action: 'sign_up',
                        error_message: error.message
                    });
                    alert(`Error: ${error.message}`);
                });
        });

        // Add event listener for login button
        popup.querySelector('#login-button').addEventListener('click', () => {
            const email = popup.querySelector('#auth-email').value;
            const password = popup.querySelector('#auth-password').value;
            
            if (!email || !password) {
                alert('Please enter both email and password.');
                return;
            }
            
            auth.signInWithEmailAndPassword(email, password)
                .then(userCredential => {
                    console.log('User logged in:', userCredential.user.email);
                    analytics.logEvent('login', {
                        method: 'email',
                        user_id: userCredential.user.uid
                    });
                    popup.remove();
                })
                .catch(error => {
                    console.error('Login error:', error.message);
                    analytics.logEvent('error', {
                        action: 'login_email',
                        error_message: error.message
                    });
                    alert(`Error: ${error.message}`);
                });
        });
    } else {
        // User is signed in; fetch and display game history in a table
        popup.innerHTML = `
            <p style="font-weight: bold; font-size: 18px; margin-bottom: 15px;">Profile</p>
            <p>Email: <span style="color: #6273B4;">${currentUser.email}</span></p>
            <p style="font-weight: bold; margin-top: 15px;">Game History:</p>
            <div style="max-height: 150px; overflow-y: auto; padding: 0 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="border-bottom: 1px solid #6273B4; padding: 5px; color: #6273B4;">Topic</th>
                            <th style="border-bottom: 1px solid #6273B4; padding: 5px; color: #6273B4;">Rank</th>
                            <th style="border-bottom: 1px solid #6273B4; padding: 5px; color: #6273B4;">Score</th>
                            <th style="border-bottom: 1px solid #6273B4; padding: 5px; color: #6273B4;">Date</th>
                        </tr>
                    </thead>
                    <tbody id="game-history"></tbody>
                </table>
            </div>
            <button id="signout-button" style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-top: 10px; margin-bottom: 10px;">Sign Out</button>
            <button style="background-color: #6273B4; color: #fff; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Close</button>
        `;
        
        // Fetch game history from Firestore
        db.collection('gameSessions')
            .where('userIdentifier', '==', currentUser.uid)
            .orderBy('timestamp', 'desc')
            .get()
            .then(querySnapshot => {
                const gameHistoryBody = popup.querySelector('#game-history');
                if (querySnapshot.empty) {
                    gameHistoryBody.innerHTML = `
                        <tr>
                            <td colspan="4" style="padding: 5px; text-align: center;">No games played yet.</td>
                        </tr>
                    `;
                } else {
                    querySnapshot.forEach(doc => {
                        const data = doc.data();
                        const timestamp = data.timestamp ? data.timestamp.toDate().toLocaleString() : 'Unknown date';
                        const rank = data.rank !== undefined ? data.rank : 'N/A';
                        gameHistoryBody.innerHTML += `
                            <tr>
                                <td style="padding: 5px;">${data.initialBlock}</td>
                                <td style="padding: 5px;">${rank}</td>
                                <td style="padding: 5px;">${data.score}</td>
                                <td style="padding: 5px;">${timestamp}</td>
                            </tr>
                        `;
                    });
                }
            })
            .catch(error => {
                console.error('Error fetching game history:', error);
                popup.querySelector('#game-history').innerHTML = `
                    <tr>
                        <td colspan="4" style="padding: 5px; text-align: center;">Error loading game history.</td>
                    </tr>
                `;
            });
        
        // Add event listener for sign-out button
        popup.querySelector('#signout-button').addEventListener('click', () => {
            auth.signOut()
                .then(() => {
                    console.log('User signed out');
                    popup.remove();
                })
                .catch(error => {
                    console.error('Sign-out error:', error.message);
                    alert(`Error: ${error.message}`);
                });
        });
    }
    
    popup.querySelector('button:last-child').addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
});

svg.addEventListener('mouseup', () => {
    isDragging = false;
    console.log('Canvas drag ended: isDragging =', isDragging);
});

svg.addEventListener('mouseleave', () => {
    isDragging = false;
    console.log('Canvas drag ended (mouseleave): isDragging =', isDragging);
});

svg.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    console.log('Canvas drag started: isDragging =', isDragging);
});

svg.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    console.log('Canvas dragging: isDragging =', isDragging);
    const dx = (e.clientX - startX) * (viewBox.width / svg.clientWidth);
    const dy = (e.clientY - startY) * (viewBox.height / svg.clientHeight);
    viewBox.minX -= dx;
    viewBox.minY -= dy;
    startX = e.clientX;
    startY = e.clientY;
    updateViewBox();
});


