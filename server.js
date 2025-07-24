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

// Veritabanı tablosu oluştur ve güncelle
db.serialize(() => {
  // Ana tablo
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

  // Yeni kolonları ekle (eğer yoksa)
  db.run(`ALTER TABLE words ADD COLUMN is_deleted BOOLEAN DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('is_deleted kolonu ekleme hatası:', err.message);
    }
  });

  db.run(`ALTER TABLE words ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.log('updated_at kolonu ekleme hatası:', err.message);
    }
  });

  console.log('Database migration tamamlandı');
});

// API Endpoints

// Aktif kelimeleri getir (silinmeyenler)
app.get('/api/words', (req, res) => {
  db.all('SELECT * FROM words WHERE is_deleted = 0 OR is_deleted IS NULL ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const words = rows.map(row => ({
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings),
      is_deleted: Boolean(row.is_deleted)
    }));
    
    res.json(words);
  });
});

// Tüm kelimeleri getir (silinenlerde dahil)
app.get('/api/words/all', (req, res) => {
  db.all('SELECT * FROM words ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const words = rows.map(row => ({
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings),
      is_deleted: Boolean(row.is_deleted)
    }));
    
    res.json(words);
  });
});

// Silinen kelimeleri getir
app.get('/api/words/deleted', (req, res) => {
  db.all('SELECT * FROM words WHERE is_deleted = 1 ORDER BY updated_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const words = rows.map(row => ({
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings),
      is_deleted: Boolean(row.is_deleted)
    }));
    
    res.json(words);
  });
});

// Belirli bir kelimeyi getir (ID ile)
app.get('/api/words/id/:id', (req, res) => {
  const id = req.params.id;
  
  db.get('SELECT * FROM words WHERE id = ?', [id], (err, row) => {
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
      turkish_meanings: JSON.parse(row.turkish_meanings),
      is_deleted: Boolean(row.is_deleted)
    };
    
    res.json(result);
  });
});

// Belirli bir kelimeyi getir (kelime ile)
app.get('/api/words/:word', (req, res) => {
  const word = req.params.word.toLowerCase();
  
  db.get('SELECT * FROM words WHERE LOWER(english_word) = ? AND (is_deleted = 0 OR is_deleted IS NULL)', [word], (err, row) => {
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
      turkish_meanings: JSON.parse(row.turkish_meanings),
      is_deleted: Boolean(row.is_deleted)
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
    'INSERT INTO words (english_word, turkish_meanings, example_sentence, example_translation, cefr_level, is_deleted, updated_at) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)',
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

// Kelime düzenle (PUT)
app.put('/api/words/:id', (req, res) => {
  const id = req.params.id;
  const { english_word, turkish_meanings, example_sentence, example_translation, cefr_level } = req.body;
  
  if (!english_word || !turkish_meanings) {
    res.status(400).json({ error: 'İngilizce kelime ve Türkçe anlamlar gerekli' });
    return;
  }
  
  const meaningsJson = JSON.stringify(turkish_meanings);
  
  db.run(
    'UPDATE words SET english_word = ?, turkish_meanings = ?, example_sentence = ?, example_translation = ?, cefr_level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [english_word, meaningsJson, example_sentence, example_translation, cefr_level, id],
    function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Kelime bulunamadı' });
        return;
      }
      
      res.json({ 
        message: 'Kelime başarıyla güncellendi',
        updatedId: id,
        changes: this.changes
      });
    }
  );
});

// Soft Delete - Kelimeyi sil (gizle)
app.delete('/api/words/:id', (req, res) => {
  const id = req.params.id;
  
  db.run('UPDATE words SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'Kelime bulunamadı' });
      return;
    }
    
    res.json({ 
      message: 'Kelime başarıyla silindi (gizlendi)',
      deletedId: id,
      changes: this.changes
    });
  });
});

// Silinen kelimeyi geri getir
app.post('/api/words/:id/restore', (req, res) => {
  const id = req.params.id;
  
  db.run('UPDATE words SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'Kelime bulunamadı' });
      return;
    }
    
    res.json({ 
      message: 'Kelime başarıyla geri getirildi',
      restoredId: id,
      changes: this.changes
    });
  });
});

// Hard Delete - Kelimeyi tamamen sil
app.delete('/api/words/:id/permanent', (req, res) => {
  const id = req.params.id;
  
  db.run('DELETE FROM words WHERE id = ?', [id], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    if (this.changes === 0) {
      res.status(404).json({ error: 'Kelime bulunamadı' });
      return;
    }
    
    res.json({ 
      message: 'Kelime kalıcı olarak silindi',
      deletedId: id,
      changes: this.changes
    });
  });
});

// CEFR düzeyine göre aktif kelimeler
app.get('/api/words/level/:level', (req, res) => {
  const level = req.params.level.toUpperCase();
  
  db.all('SELECT * FROM words WHERE cefr_level = ? AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY created_at DESC', [level], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const words = rows.map(row => ({
      ...row,
      turkish_meanings: JSON.parse(row.turkish_meanings),
      is_deleted: Boolean(row.is_deleted)
    }));
    
    res.json(words);
  });
});

// Rastgele aktif kelime getir
app.get('/api/words/random', (req, res) => {
  db.get('SELECT * FROM words WHERE (is_deleted = 0 OR is_deleted IS NULL) ORDER BY RANDOM() LIMIT 1', (err, row) => {
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
      turkish_meanings: JSON.parse(row.turkish_meanings),
      is_deleted: Boolean(row.is_deleted)
    };
    
    res.json(result);
  });
});

// Kelime ara (kısmi eşleşme - sadece aktif kelimeler)
app.get('/api/search/:query', (req, res) => {
  const query = req.params.query.toLowerCase();
  
  db.all(
    'SELECT * FROM words WHERE LOWER(english_word) LIKE ? AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY created_at DESC', 
    [`%${query}%`], 
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const words = rows.map(row => ({
        ...row,
        turkish_meanings: JSON.parse(row.turkish_meanings),
        is_deleted: Boolean(row.is_deleted)
      }));
      
      res.json(words);
    }
  );
});

// İstatistikler
app.get('/api/stats', (req, res) => {
  db.serialize(() => {
    let stats = {};
    
    // Toplam kelime sayısı
    db.get('SELECT COUNT(*) as total FROM words WHERE (is_deleted = 0 OR is_deleted IS NULL)', (err, row) => {
      if (!err) stats.total = row.total;
    });
    
    // Silinen kelime sayısı  
    db.get('SELECT COUNT(*) as deleted FROM words WHERE is_deleted = 1', (err, row) => {
      if (!err) stats.deleted = row.deleted;
    });
    
    // CEFR düzeyine göre
    db.all('SELECT cefr_level, COUNT(*) as count FROM words WHERE (is_deleted = 0 OR is_deleted IS NULL) GROUP BY cefr_level', (err, rows) => {
      if (!err) {
        stats.by_level = {};
        rows.forEach(row => {
          stats.by_level[row.cefr_level || 'unknown'] = row.count;
        });
      }
      
      res.json(stats);
    });
  });
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
  console.log(`API: http://localhost:${PORT}/api/words`);
  console.log('Soft Delete sistemi aktif!');
});