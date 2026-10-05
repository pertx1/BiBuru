export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="flex flex-col gap-4">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-4 w-72" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
