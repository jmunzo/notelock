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

// API encryption only (disables encryption page)
const apiOnly = false

/////////////////////////////////
//#region DEBUG OPTIONS
/////////////////////////////////

// Regularly print the database rows to the console (in minutes)
const prInterval = 0; // Set to 0 to never print rows


//-----------------------


/////////////////////////////////
//#region APP REQUIRE
/////////////////////////////////

const express = require('express');
const enforce = require('express-sslify');
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
    let dump = db.prepare('SELECT * FROM notelock');
    let contents = dump.all();
    // Log to console
    let timeStamp = getTimeStamp();
    console.log("[SQLITE3]", timeStamp, ":", "Printing database contents...");
    if (contents.length > 0) {
        console.log("[SQLITE3] UUID:-----------------CREATED:-----------------NOTE:-----------");
        contents.forEach(row => {
            console.log("[SQLITE3]", row.uuid, row.created, row.note);
        });
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

// Check for expired rows
const expireInterval = exInterval * 60 * 1000;
if (expireInterval > 0) {
    console.log("[CONFIG] Notes are set to expire after", noteLife, "hours");
    console.log("[CONFIG] DB rows will check for expiration every", exInterval, "minute(s)");
    setInterval(dbExpireValue, expireInterval);
} else {
    console.log("[CONFIG] Notes will never expire");
};

// Show database contents
const printInterval = prInterval * 60 * 1000;
if (printInterval > 0) {
    console.log("[CONFIG] DB contents will print every", prInterval, "minute(s)");
    setInterval(dbDumpTable, printInterval);
} else {
    console.log("[CONFIG] DB contents will not print");
}

//#endregion

//-----------------------

/////////////////////////////////
//#region API CALLS
/////////////////////////////////

// POST data to the DB
app.post('/encrypt', async (req, res) => {
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
            res.render('note.ejs', { cipher: cipherText, status: 'true', apionly: apiOnly });
            dbDeleteValue(noteId); // Purge the note from the DB
        } else {
            // Respond with error
            console.log("[NOTELOCK]", timeStamp, ":", "Note was not found");
            res.render('note.ejs', { cipher: 'false', status: 'false', apionly: apiOnly });
        };
    } else {
        if (apiOnly) {
            res.render('note.ejs', { cipher: '', status: '', apionly: apiOnly });
        } else {
            // If there's no note, just render the webpage
            res.render('index.ejs', { cipher: 'false', status: 'false', apionly: apiOnly });
        }
    };
});

// Redirect everything to the main website
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