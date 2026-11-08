// When a share means something (Offers O·3 and Analytics A·1, one rule): under 30, counts ("3 of 24 came back"), never
// a rate; from 30, the rate, always naming what it is a share of. Pure.

/** Under this many, numbers are "too few to judge" (the console says so). */
export const JUDGE_MIN = 30

/** Whether a rate over `n` is shown. */
export const judgeable = (n: number) => n >= JUDGE_MIN
