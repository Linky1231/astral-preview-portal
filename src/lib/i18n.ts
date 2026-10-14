// Tiny i18n with subscribe pattern (no extra deps).
import { useSyncExternalStore } from "react";

export type Lang = "es" | "en" | "pt" | "fr" | "de";

export const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: "es", label: "Español", flag: "🇪🇸" },
  { id: "en", label: "English", flag: "🇬🇧" },
  { id: "pt", label: "Português", flag: "🇧🇷" },
  { id: "fr", label: "Français", flag: "🇫🇷" },
  { id: "de", label: "Deutsch", flag: "🇩🇪" },
];

type Dict = Record<string, string>;
const COMMON_KEYS = [
  "tab.build","tab.inspect","tab.assets","tab.scenes","tab.settings",
  "settings.project","settings.runtime","settings.audio","settings.grid","settings.data","settings.language",
  "settings.gameName","settings.fpsCap","settings.showHUD","settings.showFPS","settings.touch","settings.autoPause",
  "settings.showHitbox","settings.mute","settings.music","settings.volume","settings.showGrid","settings.snapGrid",
  "settings.gridSize","settings.exportJson","settings.importJson","settings.resetDefaults","settings.resetProject",
  "scene.bgImage","scene.bgImagePick","scene.bgImageClear","scene.props","scene.entities",
  "scene.gravity","scene.width","scene.height","scene.bgColor","scene.scaleAll","scene.timeLimit","scene.startLives","scene.parallax",
  "inspector.particles","inspector.depth","inspector.flipX","inspector.texture","inspector.textureFit",
  "inspector.solid","inspector.gravity","inspector.hazard","inspector.collectible","inspector.slippery","inspector.checkpoint",
  "inspector.visible","inspector.opacity","inspector.behaviors","inspector.color","inspector.center","inspector.front","inspector.back",
  "inspector.clone","inspector.delete","inspector.position","inspector.size",
  "particles.enable","particles.rate","particles.lifetime","particles.speed","particles.direction","particles.spread",
  "particles.size","particles.gravity","particles.color","particles.preview","particles.close",
  "anim.title","anim.draw","anim.import","anim.timeline","anim.fps","anim.loop","anim.once","anim.pause","anim.play","anim.restart",
  "anim.duplicate","anim.delete","anim.noClips","anim.newClip",
  "paint.brush","paint.eraser","paint.fill","paint.line","paint.rect","paint.circle","paint.picker","paint.save","paint.cancel","paint.size",
  "tool.select","tool.platform","tool.coin","tool.enemy","tool.goal","tool.player","tool.erase",
  "help.title","help.gotIt",
  "common.on","common.off","common.add","common.clear","common.back","common.cancel","common.save",
] as const;

const ES: Dict = {
  "tab.build": "CONSTRUIR","tab.inspect": "INSPECCIÓN","tab.ui":"UI","tab.assets": "TEXTURAS","tab.scenes": "ESCENAS","tab.settings": "AJUSTES",
  "settings.project":"PROYECTO","settings.runtime":"EJECUCIÓN","settings.audio":"AUDIO","settings.grid":"CUADRÍCULA",
  "settings.data":"DATOS","settings.language":"IDIOMA","settings.gameName":"Nombre del juego","settings.fpsCap":"TOPE DE FPS",
  "settings.showHUD":"Mostrar HUD","settings.showFPS":"Mostrar FPS","settings.touch":"Controles táctiles","settings.autoPause":"Auto-pausa",
  "settings.showHitbox":"Mostrar hitbox","settings.mute":"Silenciar","settings.music":"Música","settings.volume":"Volumen",
  "settings.showGrid":"Mostrar cuadrícula","settings.snapGrid":"Ajustar a cuadrícula","settings.gridSize":"Tamaño cuadrícula",
  "settings.exportJson":"⤓ EXPORTAR JSON","settings.importJson":"⤒ IMPORTAR JSON","settings.resetDefaults":"↺ RESTAURAR AJUSTES",
  "settings.resetProject":"REINICIAR PROYECTO",
  "scene.bgImage":"IMAGEN DE FONDO","scene.bgImagePick":"Elegir imagen…","scene.bgImageClear":"Quitar imagen",
  "scene.props":"PROPIEDADES DE ESCENA","scene.entities":"ENTIDADES","scene.gravity":"Gravedad","scene.width":"Ancho",
  "scene.height":"Alto","scene.bgColor":"COLOR DE FONDO","scene.scaleAll":"ESCALAR ESCENA + CONTENIDO",
  "scene.timeLimit":"Tiempo límite (s · 0=off)","scene.startLives":"Vidas iniciales","scene.parallax":"CAPAS PARALLAX","scene.layers":"CAPAS",
  "layers.add":"+ NUEVA CAPA","layers.merge":"COMBINAR","layers.zIndex":"Z","layers.opacity":"OPACIDAD","layers.locked":"BLOQUEADA","layers.visible":"VISIBLE","layers.duplicate":"DUPLICAR","layers.delete":"BORRAR","layers.rename":"RENOMBRAR","layers.up":"↑ SUBIR","layers.down":"↓ BAJAR","layers.flatten":"APLANAR","layers.new":"+ NUEVA","inspector.layer":"CAPA",
  "inspector.particles":"PARTÍCULAS","inspector.depth":"Profundidad (Z)","inspector.flipX":"Voltear horizontal",
  "inspector.texture":"TEXTURA","inspector.textureFit":"AJUSTE TEXTURA","inspector.solid":"Sólido","inspector.gravity":"Gravedad",
  "inspector.hazard":"Peligro","inspector.collectible":"Coleccionable","inspector.slippery":"Resbaladizo","inspector.checkpoint":"Checkpoint",
  "inspector.visible":"Visible","inspector.opacity":"Opacidad","inspector.behaviors":"COMPORTAMIENTOS","inspector.color":"COLOR",
  "inspector.center":"⊕ CENTRAR EN ESCENA","inspector.front":"↑ FRENTE","inspector.back":"↓ ATRÁS","inspector.clone":"⧉ CLONAR",
  "inspector.delete":"BORRAR ENTIDAD","inspector.position":"POSICIÓN","inspector.size":"TAMAÑO",
  "particles.enable":"Activar emisor","particles.rate":"Por segundo","particles.lifetime":"Vida (s)","particles.speed":"Velocidad",
  "particles.direction":"Dirección (°)","particles.spread":"Dispersión (°)","particles.size":"Tamaño","particles.gravity":"Gravedad",
  "particles.color":"Color","particles.preview":"VISTA PREVIA","particles.close":"Cerrar",
  "anim.title":"ANIMACIONES","anim.draw":"✎ DIBUJAR FOTOGRAMA","anim.import":"+ IMPORTAR FOTOGRAMAS","anim.timeline":"TIMELINE",
  "anim.fps":"FPS · VELOCIDAD","anim.loop":"BUCLE","anim.once":"UNA VEZ","anim.pause":"⏸ PAUSA","anim.play":"▶ REPRODUCIR",
  "anim.restart":"↺ REINICIAR","anim.duplicate":"⧉ DUPLICAR","anim.delete":"✕ BORRAR","anim.noClips":"AÚN SIN ANIMACIONES","anim.newClip":"+ NUEVA",
  "paint.brush":"Pincel","paint.eraser":"Borrador","paint.fill":"Relleno","paint.line":"Línea","paint.rect":"Rectángulo",
  "paint.circle":"Círculo","paint.picker":"Cuentagotas","paint.save":"✓ GUARDAR","paint.cancel":"CANCELAR","paint.size":"TAMAÑO",
  "tool.select":"Seleccionar","tool.platform":"Bloque","tool.coin":"Coleccionables","tool.enemy":"Enemigo","tool.goal":"Meta","tool.player":"Jugador","tool.erase":"Borrar","tool.decor":"Decoración","library.title":"BIBLIOTECA","library.save":"+ GUARDAR SELECCIÓN","library.empty":"Aún no hay objetos guardados. Selecciona un objeto en la escena y pulsa Guardar selección.",
  "help.title":"AYUDA RÁPIDA","help.gotIt":"ENTENDIDO",
  "common.on":"ON","common.off":"OFF","common.add":"+ AÑADIR","common.clear":"LIMPIAR","common.back":"← Atrás",
  "common.cancel":"CANCELAR","common.save":"✓ GUARDAR",
  "goal.onReach":"AL ALCANZAR","goal.endsGame":"GANAR PARTIDA","goal.nextScene":"IR A ESCENA","goal.none":"Ninguna (solo ganar nivel)",
  "texture.gallery":"GALERÍA","texture.draw":"✎ DIBUJAR","texture.clear":"QUITAR TEXTURA",
};
const EN: Dict = {
  "tab.build":"BUILD","tab.inspect":"INSPECT","tab.ui":"UI","tab.assets":"TEXTURES","tab.scenes":"SCENES","tab.settings":"CONFIG",
  "settings.project":"PROJECT","settings.runtime":"RUNTIME","settings.audio":"AUDIO","settings.grid":"GRID","settings.data":"DATA",
  "settings.language":"LANGUAGE","settings.gameName":"Game name","settings.fpsCap":"FPS CAP","settings.showHUD":"Show HUD",
  "settings.showFPS":"Show FPS","settings.touch":"Touch controls","settings.autoPause":"Auto-pause","settings.showHitbox":"Show hitbox",
  "settings.mute":"Mute","settings.music":"Music","settings.volume":"Volume","settings.showGrid":"Show grid","settings.snapGrid":"Snap to grid",
  "settings.gridSize":"Grid size","settings.exportJson":"⤓ EXPORT JSON","settings.importJson":"⤒ IMPORT JSON",
  "settings.resetDefaults":"↺ RESET DEFAULTS","settings.resetProject":"RESET PROJECT",
  "scene.bgImage":"BACKGROUND IMAGE","scene.bgImagePick":"Pick image…","scene.bgImageClear":"Remove image",
  "scene.props":"SCENE PROPERTIES","scene.entities":"ENTITIES","scene.gravity":"Gravity","scene.width":"Width","scene.height":"Height",
  "scene.bgColor":"BACKGROUND COLOR","scene.scaleAll":"SCALE SCENE + CONTENT","scene.timeLimit":"Time limit (s · 0=off)",
  "scene.startLives":"Start lives","scene.parallax":"PARALLAX LAYERS",
  "inspector.particles":"PARTICLES","inspector.depth":"Depth (Z)","inspector.flipX":"Flip horizontal","inspector.texture":"TEXTURE",
  "inspector.textureFit":"TEXTURE FIT","inspector.solid":"Solid","inspector.gravity":"Gravity","inspector.hazard":"Hazard",
  "inspector.collectible":"Collectible","inspector.slippery":"Slippery","inspector.checkpoint":"Checkpoint","inspector.visible":"Visible",
  "inspector.opacity":"Opacity","inspector.behaviors":"BEHAVIORS","inspector.color":"COLOR","inspector.center":"⊕ CENTER IN SCENE",
  "inspector.front":"↑ FRONT","inspector.back":"↓ BACK","inspector.clone":"⧉ CLONE","inspector.delete":"DELETE ENTITY",
  "inspector.position":"POSITION","inspector.size":"SIZE",
  "particles.enable":"Enable emitter","particles.rate":"Per second","particles.lifetime":"Lifetime (s)","particles.speed":"Speed",
  "particles.direction":"Direction (°)","particles.spread":"Spread (°)","particles.size":"Size","particles.gravity":"Gravity",
  "particles.color":"Color","particles.preview":"PREVIEW","particles.close":"Close",
  "anim.title":"ANIMATIONS","anim.draw":"✎ DRAW FRAME","anim.import":"+ IMPORT FRAMES","anim.timeline":"TIMELINE",
  "anim.fps":"FPS · SPEED","anim.loop":"LOOP","anim.once":"PLAY ONCE","anim.pause":"⏸ PAUSE","anim.play":"▶ PLAY",
  "anim.restart":"↺ RESTART","anim.duplicate":"⧉ DUPLICATE","anim.delete":"✕ DELETE","anim.noClips":"NO ANIMATIONS YET","anim.newClip":"+ NEW",
  "paint.brush":"Brush","paint.eraser":"Eraser","paint.fill":"Fill","paint.line":"Line","paint.rect":"Rectangle",
  "paint.circle":"Circle","paint.picker":"Picker","paint.save":"✓ SAVE","paint.cancel":"CANCEL","paint.size":"SIZE",
  "tool.select":"Select","tool.platform":"Block","tool.coin":"Collectibles","tool.enemy":"Enemy","tool.goal":"Goal","tool.player":"Player","tool.erase":"Erase","tool.decor":"Decor","library.title":"LIBRARY","library.save":"+ SAVE SELECTION","library.empty":"No saved objects yet. Select an object in the scene and tap Save selection.",
  "help.title":"QUICK HELP","help.gotIt":"GOT IT",
  "common.on":"ON","common.off":"OFF","common.add":"+ ADD","common.clear":"CLEAR","common.back":"← Back","common.cancel":"CANCEL","common.save":"✓ SAVE",
  "goal.onReach":"ON REACH","goal.endsGame":"WIN GAME","goal.nextScene":"GO TO SCENE","goal.none":"None (just clear level)",
  "texture.gallery":"GALLERY","texture.draw":"✎ DRAW","texture.clear":"CLEAR TEXTURE",
};
// Build PT/FR/DE by overriding selected keys; rest falls back to EN.
const PT: Dict = { ...EN,
  "tab.build":"CRIAR","tab.inspect":"INSPEÇÃO","tab.ui":"UI","tab.scenes":"CENAS","tab.settings":"AJUSTES",
  "settings.project":"PROJETO","settings.runtime":"EXECUÇÃO","settings.audio":"ÁUDIO","settings.grid":"GRADE","settings.data":"DADOS",
  "settings.language":"IDIOMA","settings.gameName":"Nome do jogo","settings.resetProject":"REINICIAR PROJETO",
  "scene.bgImage":"IMAGEM DE FUNDO","scene.props":"PROPRIEDADES","scene.entities":"ENTIDADES",
  "inspector.particles":"PARTÍCULAS","inspector.depth":"Profundidade (Z)","inspector.flipX":"Espelhar horizontal",
  "inspector.texture":"TEXTURA","inspector.behaviors":"COMPORTAMENTOS","inspector.delete":"APAGAR ENTIDADE",
  "anim.title":"ANIMAÇÕES","anim.draw":"✎ DESENHAR QUADRO","anim.import":"+ IMPORTAR QUADROS","anim.noClips":"SEM ANIMAÇÕES",
  "paint.brush":"Pincel","paint.eraser":"Borracha","paint.fill":"Preencher","paint.line":"Linha","paint.rect":"Retângulo","paint.circle":"Círculo","paint.picker":"Conta-gotas",
  "tool.select":"Selecionar","tool.platform":"Bloco","tool.coin":"Colecionáveis","tool.enemy":"Inimigo","tool.goal":"Meta","tool.player":"Jogador","tool.erase":"Apagar",
  "help.title":"AJUDA RÁPIDA","help.gotIt":"ENTENDI","common.cancel":"CANCELAR","common.save":"✓ SALVAR","common.back":"← Voltar",
};
const FR: Dict = { ...EN,
  "tab.build":"CRÉER","tab.inspect":"INSPECTION","tab.ui":"UI","tab.scenes":"SCÈNES","tab.settings":"CONFIG",
  "settings.project":"PROJET","settings.runtime":"EXÉCUTION","settings.grid":"GRILLE","settings.data":"DONNÉES","settings.language":"LANGUE",
  "settings.gameName":"Nom du jeu","settings.resetProject":"RÉINIT. PROJET",
  "scene.bgImage":"IMAGE DE FOND","scene.props":"PROPRIÉTÉS","scene.entities":"ENTITÉS",
  "inspector.particles":"PARTICULES","inspector.depth":"Profondeur (Z)","inspector.flipX":"Retourner horiz.",
  "inspector.texture":"TEXTURE","inspector.behaviors":"COMPORTEMENTS","inspector.delete":"SUPPRIMER",
  "anim.title":"ANIMATIONS","anim.draw":"✎ DESSINER IMAGE","anim.import":"+ IMPORTER IMAGES","anim.noClips":"AUCUNE ANIMATION",
  "paint.brush":"Pinceau","paint.eraser":"Gomme","paint.fill":"Remplir","paint.line":"Ligne","paint.rect":"Rectangle","paint.circle":"Cercle","paint.picker":"Pipette",
  "tool.select":"Sélection","tool.platform":"Bloc","tool.coin":"Collectibles","tool.enemy":"Ennemi","tool.goal":"But","tool.player":"Joueur","tool.erase":"Effacer",
  "help.title":"AIDE RAPIDE","help.gotIt":"COMPRIS","common.cancel":"ANNULER","common.save":"✓ ENREGISTRER","common.back":"← Retour",
};
const DE: Dict = { ...EN,
  "tab.build":"BAUEN","tab.inspect":"PRÜFEN","tab.ui":"UI","tab.scenes":"SZENEN","tab.settings":"EINSTELL.",
  "settings.project":"PROJEKT","settings.runtime":"LAUFZEIT","settings.grid":"RASTER","settings.data":"DATEN","settings.language":"SPRACHE",
  "settings.gameName":"Spielname","settings.resetProject":"PROJEKT RESET",
  "scene.bgImage":"HINTERGRUNDBILD","scene.props":"EIGENSCHAFTEN","scene.entities":"ENTITÄTEN",
  "inspector.particles":"PARTIKEL","inspector.depth":"Tiefe (Z)","inspector.flipX":"Horiz. spiegeln",
  "inspector.texture":"TEXTUR","inspector.behaviors":"VERHALTEN","inspector.delete":"ENTITÄT LÖSCHEN",
  "anim.title":"ANIMATIONEN","anim.draw":"✎ FRAME ZEICHNEN","anim.import":"+ FRAMES IMPORT.","anim.noClips":"KEINE ANIMATIONEN",
  "paint.brush":"Pinsel","paint.eraser":"Radierer","paint.fill":"Füllen","paint.line":"Linie","paint.rect":"Rechteck","paint.circle":"Kreis","paint.picker":"Pipette",
  "tool.select":"Auswahl","tool.platform":"Block","tool.coin":"Sammelobjekte","tool.enemy":"Gegner","tool.goal":"Ziel","tool.player":"Spieler","tool.erase":"Löschen",
  "help.title":"SCHNELLHILFE","help.gotIt":"OK","common.cancel":"ABBRECHEN","common.save":"✓ SPEICHERN","common.back":"← Zurück","common.on":"AN","common.off":"AUS",
};
void COMMON_KEYS;
const DICTS: Record<Lang, Dict> = { es: ES, en: EN, pt: PT, fr: FR, de: DE };

const KEY = "asternal:lang";
let current: Lang = (typeof localStorage !== "undefined" && (localStorage.getItem(KEY) as Lang)) || "es";
const listeners = new Set<() => void>();

export function getLang(): Lang { return current; }
export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  listeners.forEach(fn => fn());
}
function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function t(key: string): string {
  return DICTS[current][key] ?? DICTS.en[key] ?? key;
}

export function useT() {
  useSyncExternalStore(subscribe, () => current, () => current);
  return t;
}
