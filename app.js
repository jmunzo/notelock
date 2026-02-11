/////////////////////////////////
//#region NOTELOCK CONFIG
/////////////////////////////////

// SSL Certificate and Key
const pCert = "./certs/certificate.cer"; // Path to SSL certificate
const pKey = "./certs/private_unencrypted.key"; // Path to SSL private unencrypted key

// Port Setup
const httpPort = 80; // HTTP port, default 80
const httpsPort = 443; // HTTPS port, default 443

// Note Expiration
const exInterval = 5; // Interval to check for expired notes (in minutes), 0 will never expire
const noteLife = 24; // Lifetime of notes (in hours), can not be less than 1

// Global Speed Limit - Apply an exponential delay to server response after client exceeds threshold
const spdTimeWindow = 15; // Time window to retain max request information (in minutes)
const spdMaxRequests = 1; // Max requests allowed within time window before delay starts increasing
const spdMaxDelayTime = 10; // Maximum amount of delay (in seconds)

// Encryption Rate Limit - Block encryption requests from client after exceeding threshold
const encTimeWindow = 30; // Time window for max encryption requests (in minutes)
const encMaxRequests = 10; // Max encryption requests allowed within time window

// Global Rate Limit - Block all requests from client after exceeding threshold
const reqTimeWindow = 15; // Time window for max requests (in minutes)
const reqMaxRequests = 100; // Max requests allowed within time window

// API encryption only (disables encryption page)
const apiOnly = false;

// Custom branding - 
const customBranding = ""; // Provide path to CSS file to enable (i.e. "./branding/style.css")

/////////////////////////////////
//#region DEBUG OPTIONS
/////////////////////////////////

// Regularly print the database rows to the console (in minutes)
const prInterval = 0; // Set to 0 to never print rows

//#endregion

//-----------------------

/////////////////////////////////
//#region APP REQUIRE
/////////////////////////////////

const express = require('express');
const enforce = require('express-sslify');
const rateLimit = require('express-rate-limit');
const slowDown = require("express-slow-down");
const { nanoid } = require('nanoid');
const ejs = require('ejs');
const Database = require('better-sqlite3');

// Get timestamp in ISO8601 format
function getTimeStamp() {
    let now = new Date();
    let timeStamp = now.toISOString();
    return timeStamp;
}

// Create a timestamp for logging
let timeStamp = getTimeStamp();

// Check if API Only
if (apiOnly) {
    console.log("[NOTELOCK]", timeStamp, ":", "Notelock is starting in API Only mode...");
} else {
    console.log("[NOTELOCK]", timeStamp, ":", "Notelock is starting...");
}

if (customBranding != ""){
    console.log("[NOTELOCK]", timeStamp, ":", "Notelock has custom branding enabled");
}

//#endregion

//-----------------------

/////////////////////////////////
//#region EXPRESS-SLOW-DOWN
/////////////////////////////////

// Speed limit for requests
const speedLimiter = slowDown({
    windowMs: spdTimeWindow * 60 * 1000, // Time (in minutes)
    delayAfter: spdMaxRequests, // Amount of requests
    delayMs: (hits) => (hits - spdMaxRequests) * 100, // Delay time (in hundredths of a second)
    maxDelayMs: spdMaxDelayTime * 1000 // Maximum delay
});
console.log("[CONFIG] Clients will experience an increasing delay after making", spdMaxRequests, "requests in", spdTimeWindow, "minute(s)");
console.log("[CONFIG] This delay will not exceed a maximum of", spdMaxDelayTime, "second(s)");

//#endregion

//-----------------------

/////////////////////////////////
//#region EXPRESS-RATE-LIMIT
/////////////////////////////////

// Rate limit for encryption
const encLimiter = rateLimit({
    windowMs: encTimeWindow * 60 * 1000, // Time (in minutes)
    max: encMaxRequests, // Amount of requests
    handler: (req, res, next, options) => {
        let client = req.ip.split(":").pop(); // Get the client IP
        let timeStamp = getTimeStamp();
        console.log("[NOTELOCK]", timeStamp, ":", "Blocking", client, "for too many encryption requests");
        // Send block response
        res.json({ id: 'ERROR', reason: 'encryption', time: `${encTimeWindow}` });
    },
    message: `Too many encryption requests! Please try again after ${encTimeWindow} minute(s).`
});
console.log("[CONFIG] Clients are allowed to encrypt", encMaxRequests, "messages every", encTimeWindow, "minute(s)");

// General rate limit
const reqLimiter = rateLimit({
    windowMs: reqTimeWindow * 60 * 1000, // Time (in minutes)
    max: reqMaxRequests, // Amount of requests
    handler: (req, res, next, options) => {
        let client = req.ip.split(":").pop(); // Get the client IP
        let timeStamp = getTimeStamp();
        console.log("[NOTELOCK]", timeStamp, ":", "Blocking", client, "for too many page requests");
        // Redirect to error page
        res.render('note.ejs', { apionly: apiOnly, branding: customBranding, error: `too many page requests. try again in ${reqTimeWindow} minute(s)` });
    },
    message: `Too many page requests! Please try again after ${reqTimeWindow} minute(s).`
});
console.log("[CONFIG] Clients are allowed to make", reqMaxRequests, "requests every", reqTimeWindow, "minute(s)")

//#endregion

//-----------------------

/////////////////////////////////
//#region EXPRESS-SSLIFY
/////////////////////////////////

const fs = require('fs');
const http = require('http');
const https = require('https');

// Populate Key and Certificate for SSL
const privateKey  = fs.readFileSync(`${pKey}`, 'utf8');
const certificate = fs.readFileSync(`${pCert}`, 'utf8');

const credentials = {key: privateKey, cert: certificate};

//#endregion

//-----------------------

/////////////////////////////////
//#region EXPRESS
/////////////////////////////////

const app = express();
app.use(enforce.HTTPS());

app.use(express.static(__dirname + '/views'));
app.set('views', __dirname + '/views');
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');

app.use(express.urlencoded({ extended: true })); // Needed to parse request body

const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

app.use(reqLimiter);
app.use(speedLimiter);

//#endregion

//-----------------------

/////////////////////////////////
//#region BETTER-SQLITE3
/////////////////////////////////

// Spin up a DB for this session only
const db = new Database(':memory:');
timeStamp = getTimeStamp();
console.log("[SQLITE3]", timeStamp, ":", "Database connected");

// Create a Table at first run
db.exec('CREATE TABLE notelock (uuid TEXT PRIMARY_KEY, note TEXT, created TEXT)');
timeStamp = getTimeStamp();
console.log("[SQLITE3]", timeStamp, ":", "Table created");

// Add data to the Table
function dbAddData(newID, cipherText) {
    // Prepare the SQL statement and execute
    let insert = db.prepare('INSERT INTO notelock (uuid, note, created) VALUES (?, ?, ?)');
    let timeStamp = getTimeStamp(); // Mark with timestamp for expiration
    insert.run(newID, cipherText, timeStamp);
};

// Find data in the Table by Primary_Key value
function dbFindData(uuid) {
    // The Primary Key to find
    let primaryKeyId = uuid;
    // Prepare the SQL statement and execute
    let find = db.prepare('SELECT * FROM notelock WHERE uuid = ?');
    let note = find.get(primaryKeyId);
    if (note) {
        return note.note;
    } else {
        return false;
    }
};

// Print Table contents to log (OPTIONAL)
function dbDumpTable() {
    // Prepare the SQL statement and execute
    let dump = db.prepare('SELECT uuid, created FROM notelock');
    let contents = dump.all();
    // Log to console
    let timeStamp = getTimeStamp();
    console.log("[SQLITE3]", timeStamp, ":", "Printing database contents...");
    if (contents.length > 0) {
        console.table(contents);
    } else {
        console.log("[SQLITE3]", timeStamp, ":", "Database is currently empty");
    };
};

// Delete Table data by Primary_Key value
function dbDeleteValue(uuid) {
    // The Primary Key to delete
    let primaryKeyId = uuid;
    // Prepare the SQL statement and execute
    let del = db.prepare('DELETE FROM notelock WHERE uuid = ?');
    let delValue = del.run(primaryKeyId);
    // Log to console
    let timeStamp = getTimeStamp();
    if (delValue) {
        console.log("[SQLITE3]", timeStamp, ":", "Purged", primaryKeyId);
    } else {
        return console.error(err.message);
    };
};

// Delete Table data by Timestamp if older than 24 hours
function dbExpireValue() {
    // Log to console
    let timeStamp = getTimeStamp();
    console.log("[SQLITE3]", timeStamp, ":", "Checking for rows older than 24 hours...");
    // Prepare the SQL statement and execute
    let deleteOldData = db.prepare(`DELETE FROM notelock WHERE created < datetime('now', '-${noteLife} hours')`);
    let delValue = deleteOldData.run();
    // Log to console
    timeStamp = getTimeStamp();
    if (delValue.changes > 0) {
        console.log("[SQLITE3]", timeStamp, ":", "Purged", delValue.changes, "rows older than 24 hours.");
    } else {
        console.log("[SQLITE3]", timeStamp, ":", "No rows found");
    }
}

// Recurring Task - Check for expired rows
const expireInterval = exInterval * 60 * 1000;
if (expireInterval > 0) {
    console.log("[CONFIG] Notes are set to expire after", noteLife, "hours");
    console.log("[CONFIG] DB rows will check for expiration every", exInterval, "minute(s)");
    setInterval(dbExpireValue, expireInterval);
} else {
    console.log("[CONFIG] Notes will never expire");
};

// Recurring Task - Print database contents
const printInterval = prInterval * 60 * 1000;
if (printInterval > 0) {
    console.log("[CONFIG] DB contents will print every", prInterval, "minute(s)");
    setInterval(dbDumpTable, printInterval);
} else {
    console.log("[CONFIG] DB contents will not print to console");
}

//#endregion

//-----------------------

/////////////////////////////////
//#region API CALLS
/////////////////////////////////

// POST data to the DB
app.post('/encrypt', encLimiter, async (req, res) => {
    let client = req.ip.split(":").pop(); // Get the client IP
    let note = req.body; // Get the encrypted message
    // Make sure the UUID is unique
    let noteId;
    while (true) {
        noteId = nanoid(); // Use nanoid to generate a 21-char url-safe UUID
        if (!(await dbFindData(noteId))) {
            await dbAddData(noteId, note.cipher);
            break;
        };
    };
    // Form URL
    const noteUrl = `https://${req.get('host')}/?n=${noteId}#`;
    // Respond with a JSON object containing the URL
    res.json({ id: noteUrl });
    // Log action to console
    let timeStamp = getTimeStamp();
    console.log("[NOTELOCK]", timeStamp, ":", client, "posted", noteId);
});

// Render the website
app.get('/', async (req, res) => {
    const note = req.query.n; // Check for a note to decrypt
    // If we have a note, attempt to decrypt it
    if (note) {
        let client = req.ip.split(":").pop(); // Get the client IP
        let noteId = note.substring(0, 21); // Extract the UUID from the query string
        // Log request to console
        let timeStamp = getTimeStamp();
        console.log("[NOTELOCK]", timeStamp, ":", client, "requested", noteId);
        // Find the DB entry
        let cipherText = await dbFindData(noteId);  
        if (cipherText) {
            // Respond with the decryption page
            res.render('note.ejs', { cipher: cipherText, apionly: apiOnly, branding: customBranding });
            dbDeleteValue(noteId); // Purge the note from the DB
        } else {
            // Respond with error
            console.log("[NOTELOCK]", timeStamp, ":", "Note was not found");
            res.render('note.ejs', { cipher: '', apionly: apiOnly, branding: customBranding });
        };
    } else {
        if (apiOnly) {
            // If we're running API Only, show a featureless webpage
            res.render('note.ejs', { apionly: apiOnly, branding: customBranding });
        } else {
            // If there's no note, just render the webpage
            res.render('index.ejs', { apionly: apiOnly, branding: customBranding });
        }
    };
});

// Redirect everything else to the main website
app.all('/{*splat}', async function(req, res){
    res.redirect("/");
});

//#endregion

//-----------------------

/////////////////////////////////
//#region LISTENERS
/////////////////////////////////

async function startServers() {
    httpServer.listen(httpPort, () => {
        let timeStamp = getTimeStamp();
        console.log("[HTTP]", timeStamp, ":", "Listening on port", httpPort);
    });
    
    httpsServer.listen(httpsPort, () => {
        let timeStamp = getTimeStamp();
        console.log("[HTTPS]", timeStamp, ":", "Listening on port", httpsPort);
    });
};

startServers().then(() => {
    let timeStamp = getTimeStamp();
    // Check if API Only
    if (apiOnly) {
        console.log("[NOTELOCK]", timeStamp, ":", "Notelock is running in API Only mode");
    } else {
        console.log("[NOTELOCK]", timeStamp, ":", "Notelock is running with webpage encryption available");
    }
    console.log("[NOTELOCK]", timeStamp, ":", "Notelock started successfully");
});

//#endregion