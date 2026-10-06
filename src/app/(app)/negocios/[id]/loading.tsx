/** Esqueleto dentro del negocio: las pestañas se quedan y el cambio entre ellas se nota al instante. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="flex flex-col gap-3">
      <div className="skeleton h-20 w-full" />
      <div className="skeleton h-11 w-full" />
      {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-16 w-full" />)}
    </div>
  );
}
