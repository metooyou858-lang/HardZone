import { cookies } from "next/headers";
import { ALL_MODULE_PERMISSIONS } from "@/lib/access";
import { getSessionCookieName, readSessionToken } from "@/lib/server/session";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default async function HomePage() {
  const token = (await cookies()).get(getSessionCookieName())?.value;
  const session = await readSessionToken(token);
  const isLocalPreview = process.env.NODE_ENV === "development";
  const modules = session?.user.modules ?? (isLocalPreview ? ALL_MODULE_PERMISSIONS : undefined);
  const name = session?.user.name.split(" ")[0] || "Команда";

  return <DashboardContent name={name} modules={modules} />;
}