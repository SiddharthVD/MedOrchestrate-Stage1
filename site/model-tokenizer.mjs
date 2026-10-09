// BERT uncased BasicTokenizer + greedy WordPiece, tested against the saved tokenizer.
export function createTokenizer(vocabulary, maxLength = 128) {
  const vocab = new Map(vocabulary.trimEnd().split(/\r?\n/).map((word, index) => [word, index]));
  const special = /\[(?:PAD|UNK|CLS|SEP|MASK)\]/g;
  const chinese = char => { const n = char.codePointAt(0); return (n >= 0x4e00 && n <= 0x9fff) || (n >= 0x3400 && n <= 0x4dbf) || (n >= 0x20000 && n <= 0x2fa1f) || (n >= 0xf900 && n <= 0xfaff); };
  const punctuation = char => /\p{P}/u.test(char) || /^[!-/:-@\[-`{-~]$/.test(char);
  function basic(text) {
    let clean = '';
    for (const char of text) {
      if (/\s/u.test(char)) clean += ' ';
      else if (char === '\ufffd' || /[\p{Cc}\p{Cf}]/u.test(char)) continue;
      else clean += chinese(char) ? ` ${char} ` : char;
    }
    return clean.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').split(/\s+/).filter(Boolean).flatMap(word => {
      const parts = []; let current = '';
      for (const char of word) {
        if (punctuation(char)) { if (current) parts.push(current); current = ''; parts.push(char); }
        else current += char;
      }
      if (current) parts.push(current);
      return parts;
    });
  }
  function wordpiece(word) {
    const chars = Array.from(word);
    if (chars.length > 100) return [100];
    const result = []; let start = 0;
    while (start < chars.length) {
      let end = chars.length, found;
      while (end > start) {
        const piece = (start ? '##' : '') + chars.slice(start, end).join('');
        if (vocab.has(piece)) { found = vocab.get(piece); break; }
        end--;
      }
      if (found === undefined) return [100];
      result.push(found); start = end;
    }
    return result;
  }
  function encode(text) {
    if (typeof text !== 'string') throw new Error('Model input must be text');
    const ids = []; let cursor = 0;
    for (const match of text.matchAll(special)) {
      ids.push(...basic(text.slice(cursor, match.index)).flatMap(wordpiece));
      ids.push(vocab.get(match[0])); cursor = match.index + match[0].length;
    }
    ids.push(...basic(text.slice(cursor)).flatMap(wordpiece));
    return [101, ...ids.slice(0, maxLength - 2), 102];
  }
  function batch(texts) {
    if (!Array.isArray(texts) || !texts.length || texts.length > 48) throw new Error('Encode 1–48 texts per request');
    const rows = texts.map(encode), width = Math.max(...rows.map(row => row.length));
    const ids = new BigInt64Array(rows.length * width), mask = new BigInt64Array(ids.length), types = new BigInt64Array(ids.length);
    rows.forEach((row, i) => row.forEach((id, j) => { ids[i * width + j] = BigInt(id); mask[i * width + j] = 1n; }));
    return { input_ids: ids, attention_mask: mask, token_type_ids: types, dims: [rows.length, width] };
  }
  return { encode, batch };
}
