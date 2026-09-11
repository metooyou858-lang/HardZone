import type { Metadata } from "next";

import CompetitionRegistrationPage from "@/components/competitions/public-registration-page";

export const metadata: Metadata = {
  title: "Командные соревнования — HardZone",
  description: "Регистрация на командные соревнования HardZone",
};

export default function Page() {
  return <CompetitionRegistrationPage />;
}
