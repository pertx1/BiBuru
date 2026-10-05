import { headers } from "next/headers";
import { RulesView } from "@/components/production/rules-view";
import { getRulesData } from "@/lib/production/data";

export const metadata = { title: "Reglas y Antola" };

export default async function ReglasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, h] = await Promise.all([getRulesData(id), headers()]);
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return (
    <RulesView
      businessId={id} designs={data.catalog.designs.map((d) => d.name)} origin={origin} antolaCreatedAt={data.antolaCreatedAt}
      shirtRules={data.shirtRules.map((r) => ({ id: r.id, shirt_color: r.shirt_color, dtf_color: r.dtf_color }))}
      designRules={data.designRules.map((r) => ({ id: r.id, design: r.design, dtf_color: r.dtf_color }))}
    />
  );
}
