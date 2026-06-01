import { Suspense } from "react";

import SalesPage from "@/components/sales/sales-page";

export default function Page() {
  return (
    <Suspense>
      <SalesPage />
    </Suspense>
  );
}
