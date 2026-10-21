import type { Metadata } from "next";
import { Suspense } from "react";

import { DocumentLibrary } from "@/components/documents/DocumentLibrary";

export const metadata: Metadata = { title: "My Documents" };

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentLibrary />
    </Suspense>
  );
}
