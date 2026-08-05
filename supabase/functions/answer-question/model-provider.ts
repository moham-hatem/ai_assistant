export const insufficientEvidenceAnswer =
  'لم أجد في المحتوى التعليمي المعتمد معلومات كافية للإجابة عن هذا السؤال. يمكنك إعادة صياغته أو سؤال معلم مختص.';

export interface AnswerModelInput {
  question: string;
  evidence?: AnswerEvidence[];
}

export interface AnswerEvidence {
  content: string;
  id: string;
}

export interface AnswerModelResult {
  answer: string;
  grounded: boolean;
}

export interface AnswerModelProvider {
  answer(input: AnswerModelInput): Promise<AnswerModelResult>;
}
