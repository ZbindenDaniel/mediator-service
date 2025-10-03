export interface RatingResult {
  target: string;
  rating: number;
}

export interface BestMatchResult {
  ratings: RatingResult[];
  bestMatch: RatingResult;
  bestMatchIndex: number;
}

export function compareTwoStrings(first: string, second: string): number;
export function findBestMatch(mainString: string, targetStrings: readonly string[]): BestMatchResult;
