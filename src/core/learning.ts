import { parseVerbs } from './verbs.ts'

export const literalLearning = (text: string): boolean => /\b[AKRH]\d+\b/i.test(text) || !!parseVerbs(text)
