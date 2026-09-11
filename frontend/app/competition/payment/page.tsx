import type { Metadata } from "next";

import CompetitionPaymentResult from "@/components/competitions/competition-payment-result";

export const metadata: Metadata = {
  title: "Оплата участия — HardZone",
  description: "Статус оплаты участия в командных соревнованиях HardZone",
};

export default function CompetitionPaymentPage() {
  return <CompetitionPaymentResult />;
}
