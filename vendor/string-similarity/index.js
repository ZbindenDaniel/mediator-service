'use strict';

function sanitize(input) {
  if (typeof input !== 'string') {
    return '';
  }
  return input.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createBigrams(text) {
  const normalized = sanitize(text);
  if (normalized.length < 2) {
    return normalized ? [normalized] : [];
  }
  const pairs = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    pairs.push(normalized.substring(i, i + 2));
  }
  return pairs;
}

function compareTwoStrings(first, second) {
  if (first === second) {
    return 1;
  }
  const pairs1 = createBigrams(first);
  const pairs2 = createBigrams(second);
  const total = pairs1.length + pairs2.length;
  if (total === 0) {
    return 0;
  }
  const map = new Map();
  for (const pair of pairs1) {
    map.set(pair, (map.get(pair) || 0) + 1);
  }
  let intersection = 0;
  for (const pair of pairs2) {
    const count = map.get(pair);
    if (count && count > 0) {
      map.set(pair, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / total;
}

function findBestMatch(mainString, targetStrings) {
  if (!Array.isArray(targetStrings) || targetStrings.length === 0) {
    throw new Error('findBestMatch requires a non-empty array of target strings');
  }
  const ratings = targetStrings.map((target) => ({
    target,
    rating: compareTwoStrings(mainString, target)
  }));
  let bestMatchIndex = 0;
  ratings.forEach((rating, index) => {
    if (rating.rating > ratings[bestMatchIndex].rating) {
      bestMatchIndex = index;
    }
  });
  return {
    ratings,
    bestMatch: ratings[bestMatchIndex],
    bestMatchIndex
  };
}

module.exports = {
  compareTwoStrings,
  findBestMatch
};
