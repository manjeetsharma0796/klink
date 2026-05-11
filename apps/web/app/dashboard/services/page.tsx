import type { Metadata } from "next";
import { PageHeader } from "../_components/page-header";
import { ServicesTable } from "@/app/services/services-table";

export const metadata: Metadata = {
  title: "Services · klink",
};

export default function DashboardServicesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Services"
        subtitle="MPP-protocol services on Solana that klink agents are verified to spend against end-to-end. Click Add to session on any row to whitelist its URL and recipient on a session in two clicks."
      />
      <ServicesTable />
    </div>
  );
}
