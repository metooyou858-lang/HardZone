import SalesPage from "@/components/sales/sales-page";

type SalesPageProps = {
  searchParams?: Promise<{
    client_id?: string | string[];
  }>;
};

export default async function Page({ searchParams }: SalesPageProps) {
  const params = await searchParams;
  const clientId = Array.isArray(params?.client_id) ? params.client_id[0] : params?.client_id;

  return <SalesPage initialClientId={clientId ?? null} />;
}
