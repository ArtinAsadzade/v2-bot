import { section } from "../ui/layout";
import { sectionTitles } from "../ui/sections";

export function walletTopupMessage(input: { balance: string; minimumTopup: string }) {
  return section(sectionTitles.wallet, [`💳 موجودی فعلی: ${input.balance}`, `حداقل شارژ: ${input.minimumTopup}`, "مبلغ شارژ را انتخاب کنید یا مبلغ دلخواه وارد کنید."]);
}
