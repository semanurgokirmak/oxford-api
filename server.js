const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Veritabanı bağlantısı
const db = new sqlite3.Database('./kelimeler.db');

// Veritabanı tablosu oluştur
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      english_word TEXT NOT NULL UNIQUE,
      turkish_meanings TEXT NOT NULL,
      example_sentence TEXT,
      example_translation TEXT,
      cefr_level TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// API Endpoints

// Tüm kelimeleri getir
app.get('/api/words', (req, res) => {
  db.all('SELECT * FROM words', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const words = rows.map(row => ({
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings)
    }));
    
    res.json(words);
  });
});

// Belirli bir kelimeyi getir
app.get('/api/words/:word', (req, res) => {
  const word = req.params.word.toLowerCase();
  
  db.get('SELECT * FROM words WHERE LOWER(english_word) = ?', [word], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'Kelime bulunamadı' });
      return;
    }
    
    const result = {
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings)
    };
    
    res.json(result);
  });
});

// Yeni kelime ekle
app.post('/api/words', (req, res) => {
  const { english_word, turkish_meanings, example_sentence, example_translation, cefr_level } = req.body;
  
  if (!english_word || !turkish_meanings) {
    res.status(400).json({ error: 'İngilizce kelime ve Türkçe anlamlar gerekli' });
    return;
  }
  
  const meaningsJson = JSON.stringify(turkish_meanings);
  
  db.run(
    'INSERT INTO words (english_word, turkish_meanings, example_sentence, example_translation, cefr_level) VALUES (?, ?, ?, ?, ?)',
    [english_word, meaningsJson, example_sentence, example_translation, cefr_level],
    function(err) {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') {
          res.status(400).json({ error: 'Bu kelime zaten mevcut' });
        } else {
          res.status(500).json({ error: err.message });
        }
        return;
      }
      
      res.status(201).json({ 
        id: this.lastID,
        message: 'Kelime başarıyla eklendi' 
      });
    }
  );
});

// CEFR düzeyine göre kelimeler
app.get('/api/words/level/:level', (req, res) => {
  const level = req.params.level.toUpperCase();
  
  db.all('SELECT * FROM words WHERE cefr_level = ?', [level], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const words = rows.map(row => ({
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings)
    }));
    
    res.json(words);
  });
});

// Rastgele kelime getir
app.get('/api/words/random', (req, res) => {
  db.get('SELECT * FROM words ORDER BY RANDOM() LIMIT 1', (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (!row) {
      res.status(404).json({ error: 'Kelime bulunamadı' });
      return;
    }
    
    const result = {
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings)
    };
    
    res.json(result);
  });
});

// Kelime ara (kısmi eşleşme)
app.get('/api/search/:query', (req, res) => {
  const query = req.params.query.toLowerCase();
  
  db.all(
    'SELECT * FROM words WHERE LOWER(english_word) LIKE ?', 
    [`%${query}%`], 
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const words = rows.map(row => ({
        ...row,
        turkish_meanings: JSON.parse(row.turkish_meanings)
      }));
      
      res.json(words);
    }
  );
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
  console.log(`API: http://localhost:${PORT}/api/words`);
});