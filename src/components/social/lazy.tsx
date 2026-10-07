"use client";
import dynamic from "next/dynamic";
export const SocialChartLazy = dynamic(() => import("./social-charts"), { ssr: false, loading: () => <div className="skeleton h-48 w-full" aria-hidden /> });
