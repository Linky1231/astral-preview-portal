import { describe, expect, it } from "vitest";
import { normalizeForModeration, reviewPost, reviewSubmission, reviewText } from "./engine";

describe("moderación en código", () => {
  it("deja pasar contenido normal de un juego", () => {
    for (const text of [
      "Nivel 3: recoge monedas y salta entre plataformas",
      "Salta sobre los enemigos y llega a la meta antes de que acabe el tiempo",
      "Guía de scripting: cómo mover al jugador con bloques",
    ]) {
      expect(reviewText(text).allowed).toBe(true);
    }
  });

  it("no confunde palabras que contienen un taco", () => {
    // «computadora» contiene «puta»; «cono» (de helado) es «coño» al normalizar.
    expect(reviewText("Compré una computadora nueva").allowed).toBe(true);
    expect(reviewText("Un cono de helado de chocolate").allowed).toBe(true);
    expect(normalizeForModeration("computadora")).toBe("computadora");
  });

  it("no bloquea descripciones legítimas de acción", () => {
    expect(reviewText("Vas a matar enemigos y disparar con el ratón").allowed).toBe(true);
    expect(reviewText("Muerte a los enemigos al final del nivel").allowed).toBe(true);
  });

  it("detecta groserías tal cual", () => {
    const verdict = reviewText("Eres una puta mierda");
    expect(verdict.allowed).toBe(false);
    expect(verdict.categories).toContain("profanity");
    expect(verdict.reason).toContain("groserías");
    expect(verdict.matches.map(m => m.term)).toContain("puta");
  });

  it("detecta variaciones: tildes, leetspeak, separadores y letras repetidas", () => {
    for (const text of [
      "eres una PÚT@",
      "put4 de mierda",
      "p.u.t.a",
      "vete p u t a",
      "puuuta",
      "putasss",
      "hijo de puta",
    ]) {
      expect(reviewText(text).allowed, text).toBe(false);
    }
  });

  it("detecta sufijos (plural, diminutivo, aumentativo)", () => {
    for (const text of ["putas", "putazo", "putita", "cabronazo", "jodete"]) {
      expect(reviewText(text).allowed, text).toBe(false);
    }
  });

  it("detecta contenido sexual explícito", () => {
    const verdict = reviewText("Mira mi contenido explícito, tengo porno y desnudos");
    expect(verdict.allowed).toBe(false);
    expect(verdict.categories).toContain("sexual");
  });

  it("detecta insultos de odio", () => {
    expect(reviewText("Ese negrata no debería estar aquí").allowed).toBe(false);
    expect(reviewText("muerte a los inmigrantes").allowed).toBe(false);
  });

  it("detecta amenazas y autolesión", () => {
    for (const text of ["te voy a matar", "voy a matarte", "muerete", "matate"]) {
      const verdict = reviewText(text);
      expect(verdict.allowed, text).toBe(false);
      expect(["violence", "dangerous"]).toContain(verdict.categories[0]);
    }
  });

  it("detecta estafas y venta prohibida", () => {
    for (const text of ["Orbes gratis en mi perfil", "generador de orbes", "hackear la cuenta", "vendo droga"]) {
      expect(reviewText(text).allowed, text).toBe(false);
    }
  });

  it("detecta datos personales y enlaces sospechosos", () => {
    expect(reviewText("Escríbeme a mi correo jugador@gmail.com").allowed).toBe(false);
    expect(reviewText("Mi teléfono es +34 612 345 678").allowed).toBe(false);
    expect(reviewText("Entra en bit.ly/orbes gratis").allowed).toBe(false);
  });

  it("detecta spam por exceso de enlaces", () => {
    const links = Array.from({ length: 7 }, (_, i) => `https://ejemplo.com/${i}`).join(" ");
    expect(reviewText(links).allowed).toBe(false);
  });

  it("revisa todos los campos de una publicación", () => {
    const ok = reviewPost({ content: "Mi primer juego en Asternal", tags: ["plataformas"], pollQuestion: "¿Qué nivel os gusta más?" });
    expect(ok.allowed).toBe(true);

    const bad = reviewPost({ content: "Buen nivel", tags: ["puta"] });
    expect(bad.allowed).toBe(false);
    expect(bad.matches.length).toBeGreaterThan(0);
  });

  it("revisa el texto interno del proyecto al publicar un juego", () => {
    const verdict = reviewSubmission({
      kind: "game",
      title: "Mi juego",
      description: "Un juego de plataformas",
      textSamples: ["Mierda de nivel", "Hola jugador"],
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("groserías");
  });

  it("informa de la gravedad y del término detectado", () => {
    const high = reviewText("porno gratis");
    expect(high.severity).toBe("high");
    const low = reviewText("sigueme y te sigo");
    expect(low.severity).toBe("low");
    expect(low.reason).toContain("spam");
  });
});
