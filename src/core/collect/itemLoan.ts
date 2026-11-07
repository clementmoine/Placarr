/**
 * @deprecated Personal loan note — absorbed by {@link ./itemAbsence}.
 * Re-exports kept so existing UI imports keep compiling until the absence modal ships.
 */
export {
  isItemOnLoan,
  loanedAtInputValue,
  normalizeItemLoanInput,
  type ItemAbsenceFields as ItemLoanFields,
} from "./itemAbsence";
