import CompetitionGridPrintPage from "@/components/competitions/competition-grid-print-page";

export default async function Page({searchParams}:{searchParams:Promise<{event?:string;complex?:string}>}) {
  const params=await searchParams;
  return <CompetitionGridPrintPage eventKey={String(params.event||"")} complexId={String(params.complex||"")} />;
}
