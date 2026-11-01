import type { Card } from "@/contracts";

const stopWords = new Set("a an and are as at be been but by can could did do does for from had has have how i if in is it its me my of on or our so some tell than that the their them there these they this to us was we were what when where which who why will with would you your".split(" "));

/** Literal skill names such as C++ and C# retain their suffixes. No fuzzy evidence repair. */
export function liveTerms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+(?:\+\+|#)?/gu) ?? [])
    .filter(word => !stopWords.has(word)))];
}

/** Fast lexical retrieval from this saved deck only; zero overlap means no match. */
export function matchLiveCards(cards: readonly Card[], transcript: string): Card[] {
  // Weight the current phrase, rather than letting an earlier topic dominate indefinitely.
  const terms = liveTerms(transcript.slice(-600));
  if (!terms.length) return [];
  return cards.map(card => {
    const prompt = new Set(liveTerms(card.prompt));
    const answer = new Set(liveTerms(card.answer));
    const score = terms.reduce((sum, term) => sum + (prompt.has(term) ? 2 : 0) + (answer.has(term) ? 1 : 0), 0);
    return { card, score };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.card.position - b.card.position)
    .slice(0, 3).map(item => item.card);
}
