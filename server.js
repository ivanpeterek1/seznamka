const express = require('express'); // framework pro web server
const sqlite3 = require('sqlite3').verbose(); // SQLite databáze
const path = require('path'); // práce s cestami k souborům
const multer = require('multer'); // upload souborů

const app = express();
const port = 3000;


app.use(express.json());

// zpřístupní statické soubory (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));



// ukládá soubory do RAM (buffer), ne na disk
const upload = multer({ storage: multer.memoryStorage() });


// vytvoření / připojení k SQLite databázi
const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');

        // vytvoření tabulky, pokud neexistuje
        db.run(`CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT, // unikátní ID
            name TEXT NOT NULL,
            dob TEXT NOT NULL, // datum narození (YYYY-MM-DD)
            gender TEXT NOT NULL,
            residence TEXT NOT NULL,
            about TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT NOT NULL,
            personality TEXT NOT NULL,
            attracted_to TEXT NOT NULL,
            sub_dom INTEGER NOT NULL, 
            photo BLOB // obrázek uložený jako binární data
        )`, (err) => {
            if (err) {
                console.error('Error creating table:', err.message);
            } else {
                console.log('Table created or already exists.');

                // pokus o přidání sloupce photo (pro starší DB)
                db.run(`ALTER TABLE profiles ADD COLUMN photo BLOB`, (err) => {
                    // ignorujeme chybu pokud už existuje
                    if (err && !err.message.includes('duplicate column name')) {
                        console.error('Error adding photo column:', err.message);
                    } else {
                        console.log('Photo column added or already exists.');
                    }
                });
            }
        });
    }
});



// hlavní stránka
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


//uložení profilu

app.post('/submit', upload.single('photo'), (req, res) => {

    // data z formuláře
    const { name, dob, gender, residence, about, phone, email, personality, attracted_to, sub_dom } = req.body;

    // pokud je nahraná fotka → uložíme buffer
    const photo = req.file ? req.file.buffer : null;

    // prepared statement (bezpečné proti SQL injection)
    const stmt = db.prepare(`
        INSERT INTO profiles 
        (name, dob, gender, residence, about, phone, email, personality, attracted_to, sub_dom, photo) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
        name, dob, gender, residence, about, phone, email,
        personality, attracted_to, parseInt(sub_dom), photo,
        function(err) {
            if (err) {
                console.error('Error inserting data:', err.message);
                res.json({ success: false, message: err.message });
            } else {
                console.log(`Inserted row with ID ${this.lastID}`);

                // po uložení přesměrování na profil
                res.redirect('/profile');
            }
        }
    );

    stmt.finalize(); // uvolnění statementu
});


app.get('/profile', (req, res) => {

    // filtry z URL (?gender=... atd.)
    const { gender, personality, attracted_to, min_age, max_age } = req.query;

    let whereClause = ''; // dynamická SQL podmínka
    let params = []; // hodnoty pro prepared statement

//filtr

    if (gender) {
        whereClause += ' AND gender = ?';
        params.push(gender);
    }

    if (personality) {
        whereClause += ' AND personality = ?';
        params.push(personality);
    }

    if (attracted_to) {
        whereClause += ' AND attracted_to = ?';
        params.push(attracted_to);
    }
    const currentYear = new Date().getFullYear();

    if (min_age) {
        const maxBirthYear = currentYear - parseInt(min_age);
        whereClause += ' AND substr(dob, 1, 4) <= ?'; // rok narození
        params.push(maxBirthYear.toString());
    }

    if (max_age) {
        const minBirthYear = currentYear - parseInt(max_age);
        whereClause += ' AND substr(dob, 1, 4) >= ?';
        params.push(minBirthYear.toString());
    }

  //počítání profilům, které odpovídají filtrům

    const countQuery = `SELECT COUNT(*) as count FROM profiles WHERE 1=1 ${whereClause}`;

    db.get(countQuery, params, (err, row) => {
        if (err) {
            console.error('Error counting profiles:', err.message);
            res.status(500).send('Database error');
            return;
        }

        const count = row.count;

        // žádné výsledky
        if (count === 0) {
            res.send('<h1>Žádné profily nevyhovují filtrům</h1><a href="/profile">Zrušit filtry</a>');
            return;
        }

//přesunutí na další profil
        const idsQuery = `SELECT id FROM profiles WHERE 1=1 ${whereClause}`;

        db.all(idsQuery, params, (err, rows) => {
            if (err) {
                console.error('Error getting IDs:', err.message);
                res.status(500).send('Database error');
                return;
            }

            // vybere náhodné ID
            const randomIndex = Math.floor(Math.random() * rows.length);
            const randomId = rows[randomIndex].id;

            // načtení konkrétního profilu
            db.get(`SELECT * FROM profiles WHERE id = ?`, [randomId], (err, profile) => {
                if (err) {
                    console.error('Error getting profile:', err.message);
                    res.status(500).send('Database error');
                    return;
                }

                //výpočet věku
                const birthYear = parseInt(profile.dob.split('-')[0]);
                const age = currentYear - birthYear; 

                //načtení html šablony
                const fs = require('fs');
                fs.readFile(path.join(__dirname, 'profile.html'), 'utf8', (err, html) => {
                    if (err) {
                        console.error('Error reading HTML:', err.message);
                        res.status(500).send('File error');
                        return;
                    }

                    // nahrazení placeholderů
                    let replacedHtml = html
                        .replace('{{title}}', profile.name || 'Profil')
                        .replace('{{name}}', profile.name || '')
                        .replace('{{dob}}', profile.dob || '')
                        .replace('{{age}}', age || '')
                        .replace('{{gender}}', profile.gender || '')
                        .replace('{{residence}}', profile.residence || '')
                        .replace('{{about}}', profile.about || '')
                        .replace('{{personality}}', profile.personality || '')
                        .replace('{{attracted_to}}', profile.attracted_to || '')
                        .replace('{{sub_dom}}', profile.sub_dom || '')
                        .replace('{{phone}}', profile.phone || '')
                        .replace('{{email}}', profile.email || '')
                        .replace('{{photo}}', profile.photo ? `/photo/${profile.id}` : '');

                    res.send(replacedHtml);
                });
            });
        });
    });
});


//fotka

app.get('/photo/:id', (req, res) => {
    const id = req.params.id;

    db.get(`SELECT photo FROM profiles WHERE id = ?`, [id], (err, row) => {
        if (err) {
            console.error('Error getting photo:', err.message);
            res.status(500).send('Database error');
            return;
        }

        if (!row || !row.photo) {
            res.status(404).send('Photo not found');
            return;
        }

        // nastaví typ obrázku 
        res.set('Content-Type', 'image/jpeg');

        // pošle obrázek jako binární data
        res.send(row.photo);
    });
});



app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
