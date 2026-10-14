/**
 * Listas de moderación escritas en código (sin IA).
 *
 * Todos los términos van en minúsculas y sin tildes: el motor
 * (`./engine.ts`) normaliza el texto antes de comparar, así que «PÜT@»,
 * «p u t a a a» o «p.u.t.a» caen en la misma entrada que «puta».
 *
 * Añadir una palabra nueva es solo añadirla aquí: no hace falta tocar el motor
 * ni desplegar ningún modelo.
 */

export type ModerationCategory =
  | "profanity"      // groserías y tacos
  | "sexual"         // contenido sexual / explícito
  | "hate"           // insultos y discurso de odio
  | "violence"       // amenazas y violencia
  | "dangerous"      // drogas, armas, autolesión
  | "scam"           // estafas, venta de cuentas/orbes, tokens de tarjeta
  | "spam"           // enlaces y texto basura
  | "personal";      // datos personales (teléfonos, correos, tarjetas)

/** Gravedad de cada categoría: decide el mensaje y si se bloquea. */
export const CATEGORY_SEVERITY: Record<ModerationCategory, "low" | "medium" | "high"> = {
  profanity: "medium",
  sexual: "high",
  hate: "high",
  violence: "high",
  dangerous: "high",
  scam: "high",
  spam: "low",
  personal: "high",
};

export const CATEGORY_LABEL: Record<ModerationCategory, string> = {
  profanity: "groserías",
  sexual: "contenido sexual explícito",
  hate: "insultos o discurso de odio",
  violence: "amenazas o violencia",
  dangerous: "contenido peligroso",
  scam: "estafa o venta prohibida",
  spam: "spam o enlaces sospechosos",
  personal: "datos personales",
};

/**
 * Términos que se buscan como palabra completa (nunca como parte de otra
 * palabra: «computadora» no debe coincidir con «puta»).
 */
export const TERMS: Record<ModerationCategory, string[]> = {
  profanity: [
    // Español
    "puta", "puto", "putas", "putos", "putazo", "putada", "putita", "putito",
    "mierda", "mierdas", "mierdero", "cagada", "cagadas", "cagar", "cagon",
    "culo", "culos", "culero", "culera", "culiao", "culear", "culiada",
    "cabron", "cabrona", "cabrones", "cabronazo",
    "pendejo", "pendeja", "pendejada", "pendejadas",
    "verga", "vergas", "verguero", "vergazo",
    "chinga", "chingar", "chingada", "chingadera", "chingatumadre", "chingon",
    "joder", "jodete", "jodido", "jodida", "jodanse",
    "cono", "cojones", "hostia", "hostias", "gilipollas", "gilipolla",
    "imbecil", "imbeciles", "idiota", "idiotas", "estupido", "estupida", "estupidos", "estupidas",
    "mamon", "mamona", "mamada", "mamadas", "mamar", "mamahuevo",
    "zorra", "zorras", "perra", "perras", "ramera", "prostituta", "putero",
    "hijueputa", "hijoputa", "hijodeputa", "malparido", "malparida",
    "gonorrea", "carechimba", "careverga", "guevon", "huevon", "weon",
    "capullo", "capulla", "mecago", "cagondios", "meacago",
    "ojete", "pito", "pitos", "pija", "pijudo",
    "tarado", "tarada", "subnormal", "mongolo", "mongolica",
    // Inglés
    "fuck", "fucks", "fucking", "fucker", "motherfucker", "shit", "shits", "bullshit",
    "bitch", "bitches", "bastard", "asshole", "assholes", "dickhead", "dumbass",
    "cunt", "cunts", "piss", "prick", "wanker", "bollocks", "crap",
  ],
  sexual: [
    "sexo", "sexual", "sexuales", "pornografia", "pornografico", "porno", "poringa",
    "desnudo", "desnuda", "desnudos", "desnudas", "desnudate",
    "tetas", "tetona", "pezones", "pezón", "nalgas", "nalgona",
    "pene", "penes", "vagina", "vaginas", "clitoris", "coño",
    "pollas", "polla", "pinga", "pingas", "picha",
    "orgia", "orgias", "orgasmo", "masturbacion", "masturbarse", "pajero", "pajera", "pajearse",
    "eyacular", "eyaculacion", "corrida", "corridas", "creampie",
    "hentai", "ecchi", "nsfw", "xxx", "pornhub", "xvideos", "onlyfans", "camgirl", "webcam sexo",
    "sexo oral", "sexo anal", "sin censura", "contenido adulto", "contenido explicito",
    "pack de fotos", "pack filtrado",
    "nude", "nudes", "boobs", "tits", "blowjob", "handjob", "cum", "squirt", "dildo",
    "horny", "sexting", "milf", "incest",
  ],
  hate: [
    "negrata", "negrata de mierda", "sudaca", "panchito", "indio de mierda",
    "retrasado", "retrasada", "retrasados", "mongolico", "deficiente mental",
    "marica", "maricon", "maricona", "maricones", "joto", "jota", "tortillera",
    "nazi", "nazis", "fascista de mierda", "hitleriano",
    // Frases con grupo protegido explícito («muerte a los» a secas bloquearía
    // textos legítimos como «muerte a los enemigos»).
    "fuera los negros", "fuera los indios", "todos los putos",
    "judio de mierda", "moro de mierda", "inmigrante de mierda",
    "faggot", "fag", "nigger", "nigga", "retard", "tranny", "kike", "spic", "chink",
  ],
  dangerous: [
    "cocaina", "cocaina pura", "metanfetamina", "cristal meth", "heroina",
    "vendo droga", "vender droga", "comprar droga", "droga barata", "porro barato",
    "pastillas de droga", "lsd", "mdma", "fentanilo",
    "arma de fuego", "pistola barata", "vendo pistola", "vendo armas", "fusil",
    "granada de mano", "explosivo casero", "como hacer una bomba", "fabricar explosivos",
    "matate", "suicidate", "como suicidarse", "cortate las venas", "autolesion",
    "medicamento sin receta", "receta falsa",
  ],
  scam: [
    "orbes gratis", "orbes ilimitados", "orbes infinitos", "generador de orbes",
    "hackear orbes", "hack de orbes", "hackear la cuenta", "cuentas robadas",
    "cuenta premium gratis", "diamantes gratis", "robux gratis", "vbucks gratis",
    "dinero facil", "gana dinero rapido", "multiplica tu dinero", "inversion garantizada",
    "bitcoin gratis", "criptomoneda gratis", "mineria gratis", "duplicar dinero",
    "regalo de paypal", "premio de paypal", "gift card gratis", "tarjetas de regalo gratis",
    "cvv", "fullz", "dumps", "tarjeta de credito filtrada", "datos de tarjetas",
    "phishing", "estafa piramidal", "esquema ponzi", "sorteo falso",
  ],
  // La violencia se detecta con los PATTERNS de abajo (frases con contexto),
  // no con palabras sueltas: «matar enemigos» es una descripción legítima.
  violence: [],
  spam: [
    "sigueme y te sigo", "follow for follow", "like por like", "pasate por mi perfil",
    "visita mi enlace", "entra a mi link", "gana seguidores", "compra seguidores",
    "bots de seguidores", "views gratis", "suscriptores gratis",
    "grupo de telegram gratis", "canal de telegram gratis",
  ],
  personal: [],
};

/**
 * Patrones con contexto: se aplican al texto normalizado (con espacios) para no
 * bloquear descripciones legítimas como «matar enemigos» en un juego.
 */
export const PATTERNS: { category: ModerationCategory; regex: RegExp; note: string }[] = [
  // Amenazas dirigidas a una persona (no «vas a matar enemigos» de un juego).
  { category: "violence", note: "amenaza directa", regex: /\b(te|os|les|le)\s+(voy|vamos|van|va)\s+a\s+(matar|violar|golpear|pegar|rajar|apu[ñn]alar|secuestrar|abusar|reventar|romper la cara)\b/ },
  { category: "violence", note: "amenaza directa", regex: /\bvoy a\s+(matarte|violarte|golpearte|pegarte|cagarte|matarlos|matarlas)\b/ },
  { category: "violence", note: "amenaza directa", regex: /\b(muerete|ojala te mueras|ojala mueras|desaparece para siempre|te vamos a buscar|se donde vives|se dónde vives)\b/ },
  { category: "hate", note: "incitacion al odio", regex: /\b(muerte|fuera|exterminar|eliminar)\s+(a\s+)?(los|las|el|la)\s+(negros|indios|judios|moros|gitanos|inmigrantes|mujeres|hombres|gays|lesbianas|trans|ninos|ancianos|discapacitados|extranjeros)\b/ },
  { category: "sexual", note: "solicitud de contenido sexual", regex: /\b(manda|envia|pasa|muestra)\s*(me)?\s+(tus\s+)?(fotos?|pack|nudes?|tetas|culo|pene|vagina)\b/ },
  { category: "sexual", note: "propuesta sexual", regex: /\b(quiero|busco)\s+(sexo|tener sexo|algo sexual|coger|que me la mames)\b/ },
  { category: "sexual", note: "menor en contexto sexual", regex: /\b(menor|menores|nino|nina|adolescente)\b.{0,40}\b(sexo|sexual|desnudo|porno)\b/ },
  { category: "scam", note: "datos de tarjeta", regex: /\b\d{13,19}\b/ },
  // Teléfonos: con prefijo internacional o en grupos «123 456 789» (no un número suelto).
  { category: "personal", note: "telefono o documento", regex: /\+\d[\d\s.-]{7,}|\b\d{2,4}[\s.-]\d{3,4}[\s.-]\d{2,4}\b/ },
  { category: "personal", note: "correo personal", regex: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/ },
  { category: "spam", note: "enlaces de dudosa procedencia", regex: /\b(bit\.ly|t\.me|wa\.me|tinyurl\.com|cutt\.ly|linktr\.ee|discord\.gg|whatsapp\.com)\b/ },
  { category: "spam", note: "promesa de premio", regex: /\b(ganaste|has ganado|felicidades has ganado)\b.{0,30}\b(premio|orbes|dinero|iphone|telefono)\b/ },
];

/**
 * Términos que solo cuentan si el texto ORIGINAL trae su forma exacta: existen
 * palabras normales que coinciden tras normalizar tildes («cono» = cono de
 * helado vs. «coño»), así que se exige la grafía real para no dar falsos
 * positivos.
 */
export const STRICT_ORIGINAL: Record<string, RegExp> = {
  // Solo si el texto trae la ñ (o su variante con número): «coño», «c0ño».
  // Así «cono» de helado nunca se bloquea.
  cono: /c[o0]ñ[o0]/,
};
