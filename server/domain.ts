export interface ChatTurn {
  content: string;
  role: 'assistant' | 'user';
}

export type AnswerLanguage = 'ar' | 'en' | 'sw';

export interface Evidence {
  content: string;
  id: string;
  questionPart?: string;
}

export interface AnswerInput {
  history: ChatTurn[];
  language: AnswerLanguage;
  question: string;
}

export interface AnswerResult {
  answer: string;
  grounded: boolean;
}

export interface KnowledgeResult {
  evidence: Evidence[];
  fileCount: number;
}

export interface KnowledgeSource {
  search(question: string, limit: number, alternatives?: string[]): Promise<KnowledgeResult>;
}

export interface QuestionExpander {
  expand(question: string): Promise<string[]>;
}

export interface AnswerModel {
  answer(input: AnswerInput, evidence: Evidence[]): Promise<AnswerResult>;
}

const insufficientEvidenceAnswers: Record<AnswerLanguage, string> = {
  ar: 'لم أجد في المحتوى التعليمي المحلي معلومات كافية للإجابة عن هذا السؤال. يمكنك إعادة صياغته أو سؤال معلم مختص.',
  en: 'I could not find enough information in the local educational content to answer this question. You can rephrase it or ask a qualified teacher.',
  sw: 'Sikupata maelezo ya kutosha katika maudhui ya elimu yaliyohifadhiwa ili kujibu swali hili. Unaweza kuliuliza kwa njia nyingine au kumuuliza mwalimu mwenye ujuzi.',
};

export function insufficientEvidenceAnswer(language: AnswerLanguage = 'ar'): string {
  return insufficientEvidenceAnswers[language];
}
