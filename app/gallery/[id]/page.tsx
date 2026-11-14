"use client";

import { use } from "react";
import { LandingNav, Footer } from "@/components/landing/Sections";
import { ProjectDetailLoader } from "@/components/projects/ProjectDetail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // The public gallery only ever exposes submitted projects.
  return (
    <>
      <LandingNav />
      <main id="main" className="mx-auto max-w-[1480px] px-4 pb-24 pt-24 md:px-10 md:pt-28">
        <ProjectDetailLoader id={Number(id)} publicView />
      </main>
      <Footer />
    </>
  );
}
