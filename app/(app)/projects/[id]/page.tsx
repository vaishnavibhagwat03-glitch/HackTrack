"use client";

import { use } from "react";
import { ProjectDetailLoader } from "@/components/projects/ProjectDetail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ProjectDetailLoader id={Number(id)} />;
}
