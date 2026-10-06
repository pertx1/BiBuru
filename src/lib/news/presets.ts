import { googleNewsUrl, type SourceKind } from "./sources";

/** Temas iniciales (se pueden editar, ordenar y desactivar). Las palabras clave sirven para clasificar antes de la IA. */
export const PRESET_TOPICS = [
  { key: "negocios", name: "Negocios y emprendimiento", color: "#7b6cf6", icon: "briefcase", description: "Modelos de negocio, oportunidades, casos reales con cifras.",
    keywords: ["emprend", "startup", "pyme", "negocio", "facturación", "ventas", "modelo de negocio", "franquicia", "inversión", "ronda", "founder", "business", "revenue", "small business"] },
  { key: "tecnologia", name: "Tecnología e IA aplicada", color: "#3b82f6", icon: "cpu", description: "Herramientas nuevas, automatización y lanzamientos útiles para negocios.",
    keywords: ["inteligencia artificial", " ia ", "chatgpt", "gemini", "claude", "automatiz", "herramienta", "app", "software", "saas", "ai ", "tool", "launch", "lanza"] },
  { key: "economia", name: "Economía", color: "#22c55e", icon: "landmark", description: "Consumo, precios, tipos de interés, fiscalidad y ayudas para autónomos en España.",
    keywords: ["autónomo", "hacienda", "iva", "irpf", "cuota", "ayuda", "subvención", "kit digital", "bce", "euríbor", "tipos de interés", "ipc", "inflación", "consumo", "precios", "impuesto"] },
  { key: "ecommerce", name: "Ecommerce y moda", color: "#f59e0b", icon: "shopping-bag", description: "Plataformas de venta, logística y tendencias en marcas de ropa.",
    keywords: ["ecommerce", "e-commerce", "tienda online", "shopify", "amazon", "vinted", "wallapop", "shein", "temu", "zalando", "inditex", "moda", "ropa", "textil", "logística", "envío", "devoluciones", "marketplace"] },
  { key: "marketing", name: "Marketing digital y creadores", color: "#ec4899", icon: "megaphone", description: "Cambios en Instagram, TikTok y YouTube, publicidad y monetización.",
    keywords: ["instagram", "tiktok", "youtube", "meta", "algoritmo", "creador", "influencer", "publicidad", "anuncios", "ads", "monetiz", "seo", "newsletter", "reels", "shorts", "afiliación"] },
] as const;

export type PresetSource = { kind: SourceKind; name: string; url: string; lang: "es" | "en"; topic: (typeof PRESET_TOPICS)[number]["key"] };

/**
 * Medios precargados. Se dan de alta como «sin comprobar»: la primera recogida comprueba que responden y marca como «caídos»
 * los que fallen (se ven en Ajustes → Noticias). Las búsquedas de Google News cubren lo que no tiene feed propio.
 */
export const PRESET_SOURCES: PresetSource[] = [
  { kind: "rss", name: "Expansión", url: "https://e00-expansion.uecdn.es/rss/portada.xml", lang: "es", topic: "economia" },
  { kind: "rss", name: "Cinco Días", url: "https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada", lang: "es", topic: "economia" },
  { kind: "rss", name: "elEconomista", url: "https://www.eleconomista.es/rss/rss-economia.php", lang: "es", topic: "economia" },
  { kind: "rss", name: "Xataka", url: "https://feeds.weblogssl.com/xataka2", lang: "es", topic: "tecnologia" },
  { kind: "rss", name: "Genbeta", url: "https://feeds.weblogssl.com/genbeta", lang: "es", topic: "tecnologia" },
  { kind: "rss", name: "Marketing4eCommerce", url: "https://marketing4ecommerce.net/feed/", lang: "es", topic: "ecommerce" },
  { kind: "rss", name: "TechCrunch", url: "https://techcrunch.com/feed/", lang: "en", topic: "tecnologia" },
  { kind: "rss", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", lang: "en", topic: "tecnologia" },
  { kind: "google_news", name: "Google News: autónomos", url: googleNewsUrl("autónomos (ayudas OR Hacienda OR cuota OR IVA)", "es"), lang: "es", topic: "economia" },
  { kind: "google_news", name: "Google News: ecommerce y moda", url: googleNewsUrl("(ecommerce OR \"tienda online\") (moda OR ropa)", "es"), lang: "es", topic: "ecommerce" },
  { kind: "google_news", name: "Google News: creadores y redes", url: googleNewsUrl("(Instagram OR TikTok OR YouTube) (creadores OR monetización OR algoritmo)", "es"), lang: "es", topic: "marketing" },
  { kind: "google_news", name: "Google News: IA para pymes", url: googleNewsUrl("\"inteligencia artificial\" (pymes OR autónomos OR negocios)", "es"), lang: "es", topic: "tecnologia" },
  { kind: "google_news", name: "Google News: emprendedores", url: googleNewsUrl("emprendedores (facturación OR ventas OR caso de éxito)", "es"), lang: "es", topic: "negocios" },
];
