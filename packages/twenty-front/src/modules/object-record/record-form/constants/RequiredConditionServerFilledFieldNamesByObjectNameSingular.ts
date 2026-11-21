// The policy create pre-query hook stamps submittedDate on user creates, so the form never asks for it
export const REQUIRED_CONDITION_SERVER_FILLED_FIELD_NAMES_BY_OBJECT_NAME_SINGULAR: Record<
  string,
  string[]
> = {
  policy: ['submittedDate'],
};
