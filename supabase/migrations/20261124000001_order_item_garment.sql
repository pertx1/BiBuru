-- Cada línea de pedido dice si es camiseta, sudadera u otra cosa (sin prenda): decide de qué prenda resta el stock.
-- null = pedidos anteriores: se sigue deduciendo como antes (por el producto, el diseño y el color).
alter table public.order_items add column if not exists garment text
  check (garment is null or garment in ('camiseta', 'sudadera', 'otro'));
