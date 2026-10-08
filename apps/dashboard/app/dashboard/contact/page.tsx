"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContactContent } from "@/components/contact-content";

export default function DashboardContactPage() {
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <Link href="/dashboard" className="breadcrumb">
        <ArrowLeft size={15} /> Back to Dashboard
      </Link>

      <ContactContent isInsideDashboard={true} />
    </div>
  );
}
