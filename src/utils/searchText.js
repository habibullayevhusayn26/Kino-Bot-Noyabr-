function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function createNgrams(value, size = 3) {
  const text = normalizeSearchText(value);
  if (!text) return [];
  if (text.length < size) return [text];

  const ngrams = new Set();
  for (let index = 0; index <= text.length - size; index += 1) {
    ngrams.add(text.slice(index, index + size));
  }
  return [...ngrams];
}

function editDistance(left, right) {
  const first = Array.from(left);
  const second = Array.from(right);
  if (first.length > second.length) return editDistance(right, left);

  let previous = Array.from({ length: first.length + 1 }, (_, index) => index);
  for (let row = 1; row <= second.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= first.length; column += 1) {
      const substitutionCost = first[column - 1] === second[row - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost
      );
    }
    previous = current;
  }
  return previous[first.length];
}

function similarity(left, right) {
  if (!left || !right) return 0;
  const length = Math.max(Array.from(left).length, Array.from(right).length);
  return 1 - editDistance(left, right) / length;
}

function scoreTitleMatch(query, title) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTitle = normalizeSearchText(title);
  if (!normalizedQuery || !normalizedTitle) return 0;
  if (normalizedTitle === normalizedQuery) return 1;
  if (normalizedTitle.startsWith(normalizedQuery)) return 0.99;
  if (normalizedTitle.includes(normalizedQuery)) return 0.95;

  const queryTokens = normalizedQuery.split(' ');
  const titleTokens = normalizedTitle.split(' ');
  const tokenScores = queryTokens.map((queryToken) => {
    let bestScore = 0;
    for (const titleToken of titleTokens) {
      const score = titleToken.includes(queryToken) ? 0.92 : similarity(queryToken, titleToken);
      bestScore = Math.max(bestScore, score);
    }
    return bestScore;
  });
  return tokenScores.reduce((total, score) => total + score, 0) / tokenScores.length;
}

module.exports = {
  normalizeSearchText,
  createNgrams,
  editDistance,
  scoreTitleMatch
};
