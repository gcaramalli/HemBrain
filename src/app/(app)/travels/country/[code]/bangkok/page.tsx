"use client";

import dynamic from "next/dynamic";
import { notFound, useParams } from "next/navigation";

// three.js only loads on this page.
const Bangkok3D = dynamic(() => import("@/components/bangkok-3d"), { ssr: false });

export default function BangkokPage() {
  const { code } = useParams<{ code: string }>();
  if (String(code).toUpperCase() !== "TH") notFound();
  return <Bangkok3D back="/travels/country/TH" />;
}
