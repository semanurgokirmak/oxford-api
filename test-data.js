const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./kelimeler.db');

const testWords = [
  {
    english_word: 'hello',
    turkish_meanings: ['merhaba', 'selam'],
    example_sentence: 'Hello, how are you?',
    example_translation: 'Merhaba, nasılsın?',
    cefr_level: 'A1'
  },
  {
    english_word: 'beautiful',
    turkish_meanings: ['güzel', 'hoş'],
    example_sentence: 'She has a beautiful smile.',
    example_translation: 'Onun güzel bir gülümsemesi var.',
    cefr_level: 'A2'
  },
  {
    english_word: 'understand',
    turkish_meanings: ['anlamak', 'kavramak'],
    example_sentence: 'I understand your problem.',
    example_translation: 'Problemini anlıyorum.',
    cefr_level: 'B1'
  }
];

db.serialize(() => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO words 
    (english_word, turkish_meanings, example_sentence, example_translation, cefr_level) 
    VALUES (?, ?, ?, ?, ?)
  `);

  testWords.forEach(word => {
    stmt.run(
      word.english_word,
      JSON.stringify(word.turkish_meanings),
      word.example_sentence,
      word.example_translation,
      word.cefr_level
    );
  });

  stmt.finalize();
  console.log('Test verileri eklendi!');
});

db.close();