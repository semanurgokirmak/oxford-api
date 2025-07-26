const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL bağlantısı
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Veritabanı tablosu oluştur
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS words (
        id SERIAL PRIMARY KEY,
        english_word TEXT NOT NULL UNIQUE,
        turkish_meanings JSONB NOT NULL,
        example_sentence TEXT,
        example_translation TEXT,
        cefr_level TEXT,
        is_deleted BOOLEAN DEFAULT FALSE,
        known BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // 🚀 Existing table'a known kolonu ekle (eğer yoksa)
    await pool.query(`
      ALTER TABLE words 
      ADD COLUMN IF NOT EXISTS known BOOLEAN DEFAULT FALSE
    `);
    
    console.log('✅ PostgreSQL table created/updated successfully with known field!');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

// Sunucu başlatılırken tabloyu oluştur
initDatabase();

// API Endpoints

// Aktif kelimeleri getir (silinmeyenler)
app.get('/api/words', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM words WHERE is_deleted = FALSE ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get words error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🚀 YENİ: Kelime known durumunu güncelle
app.patch('/api/words/:id/known', async (req, res) => {
  try {
    const { id } = req.params;
    const { known } = req.body;
    
    if (typeof known !== 'boolean') {
      return res.status(400).json({ error: 'known değeri boolean olmalı' });
    }
    
    const result = await pool.query(
      'UPDATE words SET known = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [known, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Kelime bulunamadı' });
    }
    
    res.json({ 
      message: known ? 'Kelime öğrenildi olarak işaretlendi' : 'Kelime öğrenilecek olarak işaretlendi',
      wordId: parseInt(id),
      known: known
    });
  } catch (error) {
    console.error('Update known status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🚀 YENİ: Öğrenilen/öğrenilmemiş kelimeleri getir
app.get('/api/words/known/:status', async (req, res) => {
  try {
    const { status } = req.params; // 'true' veya 'false'
    const isKnown = status === 'true';
    
    const result = await pool.query(
      'SELECT * FROM words WHERE is_deleted = FALSE AND known = $1 ORDER BY updated_at DESC',
      [isKnown]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get words by known status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Tüm kelimeleri getir (silinenlerde dahil)
app.get('/api/words/all', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM words ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all words error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Silinen kelimeleri getir
app.get('/api/words/deleted', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM words WHERE is_deleted = TRUE ORDER BY updated_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get deleted words error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ID ile kelime getir
app.get('/api/words/id/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM words WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kelime bulunamadı' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get word by ID error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kelime ile ara
app.get('/api/words/:word', async (req, res) => {
  try {
    const word = req.params.word.toLowerCase();
    const result = await pool.query(
      'SELECT * FROM words WHERE LOWER(english_word) = $1 AND is_deleted = FALSE',
      [word]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Kelime bulunamadı' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get word error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Yeni kelime ekle
app.post('/api/words', async (req, res) => {
  try {
    const { english_word, turkish_meanings, example_sentence, example_translation, cefr_level } = req.body;
    
    if (!english_word || !turkish_meanings) {
      return res.status(400).json({ error: 'İngilizce kelime ve Türkçe anlamlar gerekli' });
    }
    
    // 🚀 GÜNCELLENMIŞ: known field'ı da ekleniyor (default false)
    const result = await pool.query(
      `INSERT INTO words (english_word, turkish_meanings, example_sentence, example_translation, cefr_level, known, updated_at) 
       VALUES ($1, $2, $3, $4, $5, FALSE, CURRENT_TIMESTAMP) 
       RETURNING id`,
      [english_word, JSON.stringify(turkish_meanings), example_sentence, example_translation, cefr_level]
    );
    
    res.status(201).json({ 
      id: result.rows[0].id,
      message: 'Kelime başarıyla eklendi' 
    });
  } catch (error) {
    console.error('Add word error:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'Bu kelime zaten mevcut' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// Kelime düzenle
app.put('/api/words/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { english_word, turkish_meanings, example_sentence, example_translation, cefr_level } = req.body;
    
    if (!english_word || !turkish_meanings) {
      return res.status(400).json({ error: 'İngilizce kelime ve Türkçe anlamlar gerekli' });
    }
    
    const result = await pool.query(
      `UPDATE words 
       SET english_word = $1, turkish_meanings = $2, example_sentence = $3, 
           example_translation = $4, cefr_level = $5, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $6`,
      [english_word, JSON.stringify(turkish_meanings), example_sentence, example_translation, cefr_level, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Kelime bulunamadı' });
    }
    
    res.json({ 
      message: 'Kelime başarıyla güncellendi',
      updatedId: parseInt(id),
      changes: result.rowCount
    });
  } catch (error) {
    console.error('Update word error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Soft Delete - Kelimeyi gizle
app.delete('/api/words/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE words SET is_deleted = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Kelime bulunamadı' });
    }
    
    res.json({ 
      message: 'Kelime başarıyla silindi (gizlendi)',
      deletedId: parseInt(id),
      changes: result.rowCount
    });
  } catch (error) {
    console.error('Delete word error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Silinen kelimeyi geri getir
app.post('/api/words/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE words SET is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Kelime bulunamadı' });
    }
    
    res.json({ 
      message: 'Kelime başarıyla geri getirildi',
      restoredId: parseInt(id),
      changes: result.rowCount
    });
  } catch (error) {
    console.error('Restore word error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Hard Delete - Kelimeyi tamamen sil
app.delete('/api/words/:id/permanent', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM words WHERE id = $1',
      [id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Kelime bulunamadı' });
    }
    
    res.json({ 
      message: 'Kelime kalıcı olarak silindi',
      deletedId: parseInt(id),
      changes: result.rowCount
    });
  } catch (error) {
    console.error('Permanent delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CEFR düzeyine göre aktif kelimeler
app.get('/api/words/level/:level', async (req, res) => {
  try {
    const level = req.params.level.toUpperCase();
    const result = await pool.query(
      'SELECT * FROM words WHERE cefr_level = $1 AND is_deleted = FALSE ORDER BY created_at DESC',
      [level]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get words by level error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🚀 GÜNCELLENMIŞ: Rastgele aktif kelime getir (sadece öğrenilmemiş)
app.get('/api/words/random', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM words WHERE is_deleted = FALSE AND known = FALSE ORDER BY RANDOM() LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Öğrenilmemiş kelime bulunamadı' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get random word error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kelime ara (kısmi eşleşme - sadece aktif kelimeler)
app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const result = await pool.query(
      'SELECT * FROM words WHERE LOWER(english_word) LIKE $1 AND is_deleted = FALSE ORDER BY created_at DESC',
      [`%${query}%`]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Search words error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 🚀 GÜNCELLENMIŞ: İstatistikler (known field dahil)
app.get('/api/stats', async (req, res) => {
  try {
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM words WHERE is_deleted = FALSE'
    );
    
    const deletedResult = await pool.query(
      'SELECT COUNT(*) as deleted FROM words WHERE is_deleted = TRUE'
    );
    
    const knownResult = await pool.query(
      'SELECT COUNT(*) as known FROM words WHERE is_deleted = FALSE AND known = TRUE'
    );
    
    const unknownResult = await pool.query(
      'SELECT COUNT(*) as unknown FROM words WHERE is_deleted = FALSE AND known = FALSE'
    );
    
    const levelResult = await pool.query(
      'SELECT cefr_level, COUNT(*) as count FROM words WHERE is_deleted = FALSE GROUP BY cefr_level'
    );
    
    const byLevel = {};
    levelResult.rows.forEach(row => {
      byLevel[row.cefr_level || 'unknown'] = parseInt(row.count);
    });
    
    res.json({
      total: parseInt(totalResult.rows[0].total),
      deleted: parseInt(deletedResult.rows[0].deleted),
      known: parseInt(knownResult.rows[0].known),
      unknown: parseInt(unknownResult.rows[0].unknown),
      by_level: byLevel
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', database: 'Disconnected', error: error.message });
  }
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda çalışıyor`);
  console.log(`📊 API: http://localhost:${PORT}/api/words`);
  console.log(`💾 Database: PostgreSQL with known field support`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`✨ New endpoints:`);
  console.log(`   - PATCH /api/words/:id/known (update known status)`);
  console.log(`   - GET /api/words/known/true (get known words)`);
  console.log(`   - GET /api/words/known/false (get unknown words)`);
});