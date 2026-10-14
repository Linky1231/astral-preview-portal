// Contexto portable del motor para el generador de scripts con IA. Se mantiene como TypeScript para que el
// mismo asistente funcione tanto en Vite como en el servidor de Manus.
// La IA usa esto para programar scripts correctamente y no inventar APIs.
export const ENGINE_KNOWLEDGE = `
Asternal Engine — motor de juegos 2D móvil (TypeScript, stack Vite+React+Supabase).

PROYECTO / ESCENA
- Project { name, scenes: Scene[], activeSceneId, assets: { sprites }, settings: ProjectSettings }
- Scene { id, name, bg, bgImage, bgImageMode, gravity, width, height, entities: Entity[], variables, timeLimit, layers: SceneLayer[], startLives, ui: UIElement[] }
- Scene.variables: Record<string, string|number|boolean> — estado compartido de la escena (ver setVariable/changeVariable/broadcast).
- newScene(name), newProject(), ensureSceneLayers(scene), sortedForRender(scene), isOnHiddenLayer(scene,e), layerOpacityFor(scene,e)

ENTIDAD
- EntityKind = "player" | "platform" | "enemy" | "coin" | "goal" | "decor"
- Entity { id, kind, x,y,w,h, vx,vy, color, solid, gravity, controllable, collectible, hazard, goal, visible, opacity, texture, animations, scripts: Script[], variables, tags, hitbox, value, moving, crumble, spring, patrol, checkpoint, slippery, sticky, locked, powerup, switchId, doorId, emitter, z, layerId, parentId, facing, flipX, rotation, textureFit, nextSceneId, endsGame, dialog }
- KIND_PRESETS[kind]: preset de flags por tipo. Usar para spawnEntity.

JERARQUÍA (objetos padre / hijo)
- Entity.parentId: id del objeto padre, o null/undefined si es raíz. Un hijo es una entidad normal: conserva sus scripts, comportamientos y ajustes.
- Cuando el padre se mueve, sus hijos se desplazan exactamente igual; el hijo además se mueve por su cuenta y se mantiene dentro del rectángulo del padre cuando cabe. El reparto se encadena en cualquier profundidad.
- Helpers: entityById(scene,id), childrenOf(scene,parentId), descendantIds(scene,id), hierarchyDepth(scene,e), canAttachAsChild(scene,childId,parentId) (evita ciclos), attachEntityToParent(scene,childId,parentId), detachEntityFromParent(scene,childId), createChildFromPreset(scene,parentId,preset) (el editor crea los hijos con un asset guardado de la Biblioteca; nace centrado, sin gravedad, misma capa), createChildEntity(scene,parentId,kind) (misma idea desde un tipo del motor), moveEntityWithChildren(scene,id,dx,dy), setEntityPosition(scene,id,x,y), removeEntityWithChildren(scene,id) (borra la rama), syncChildrenWithParents(scene) (lo llama stepScene al final de cada fotograma).
- Para mover objetos desde un script usa setProperty/property x|y, que ya respeta la jerarquía.

CAPAS (editor simplificado — 2 controles)
- SceneLayer { id, name, z: number, visible: boolean, locked: boolean, opacity?: number }
- DEFAULT_LAYER_ID = "default"
- Profundidad 1-10: ≤5 delante de la cámara, >5 detrás. Mapeo usado en el editor: depth = clamp(1..10, 5 - round(z))  <=>  z = 5 - depth.
  Ej: 1→z=4 (máximo delante), 5→z=0 (frente), 6→z=-1 (detrás), 10→z=-4 (fondo). Si programas scripts que mueven entre capas, usa layerId y explica este mapeo.
- La UI del editor solo expone: (1) ocultar/mostrar capa y (2) slider de profundidad 1-10 con esa regla.

FÍSICA / RUNTIME
- Constantes: BASE_SPEED=220, JUMP=520, TERMINAL=1200. Gravedad por escena (default 1400). Coyote 0.10s, jump buffer 0.12s, variable jump (JUMP_CUT 0.45 en release).
- AABB con hitbox opcional, resolvedor MTV iterativo, ledge detection para enemigos, plataformas móviles (MovingSpec axis/range/speed), crumble, resortes, patrol.
- stepScene(scene, input: RuntimeInput{left,right,jump}, state: RuntimeState, dt)
- RuntimeState { score, lives, win, dead, cameraX, time, coyoteT, jumpBufferT, invulnT, speedT, switches, checkpoint, particles, dialog }
- Sistemas: coleccionables, hazards (invulnerabilidad), puertas/switches, checkpoints, diálogos (touch/interact/auto, pausesGame), powerups (speed/djump/invuln).

ANIMACIONES
- AnimationClip { id, name, fps, loop, frames: string[] (dataURL) }. Entity.animations: AnimationClip[].
- currentFrameRenderable(e, time, state?), pickAnimState, findClip. Fidelidad: frame composite respetado sin recorte.

AUDIO
- Sin sonidos predeterminados: los bloques de sonido solo reproducen archivos del usuario. playSoundUrl(url), playRandomCustomSound() (elige uno al azar de la biblioteca local), loadCustomSounds(), addCustomSound(name, url), vibrate(ms), setVolume, setMuted, startMusic(url), stopMusic(). El bloque playSound guarda soundUrl (dataURL/URL del archivo) y soundName (nombre visible); si faltan, no suena nada.

SCRIPTING (bloques visuales — genera Entity.scripts: Script[])
- EventType = onStart|onCreate|onUpdate|onCollide|onKeyDown|onScoreReach|onDestroyed|onDestroy|onTimer|onLeaveScreen|onLand|onWin|onLose|onMessage (entidades) y onTap|onHold|onRelease (elementos de UI: al pulsar, mientras se mantiene y al soltar)
- Script { id, event, withKind?: EntityKind|"any" (onCollide), key?: "left"|"right"|"jump" (onKeyDown), threshold?: number (onScoreReach), interval?: number ms (onTimer), message?: string (onMessage), blocks: Block[] }
- BlockKind (51): jump, setVx, setVy, addScore, destroySelf, destroyOther, win, lose, teleport, log, playSound, vibrate, shake, setColor, setSize, setGravity, setControllable, impulse, setVisible, restartScene, setBg, if, setX, setY, moveX, moveY, flipVx, flipVy, bounceY, stop, setSpeed, setOpacity, setHazard, setSolid, setCollectible, setGoalFlag, addLives, setLives, setScore, resetScore, spawnEntity, cloneSelf, setSceneGravity, playRandomSound, wrapScreen, faceTarget, chase, setHitbox, clearHitbox, removeAllOf, comment, hurtPlayer, wait, setFacing, knockback, pushAway, setVariable, changeVariable, setProperty, changeProperty, broadcast, ifVariable, repeat, setObjectSize
- Block { id, kind, value, x,y,w,h, text, soundUrl, soundName, color, bool, cond: "scoreGte"|"scoreLte", thenBlocks, elseBlocks, target: "self"|"other"|"scene", scope: "entity"|"scene", property: GenericProperty, operator: "eq"|"neq"|"gte"|"lte", repeat }
- GenericProperty = x|y|vx|vy|w|h|opacity|rotation|visible|solid|gravity|controllable|hazard|collectible|goal
- Helpers: nextVariableValue, variableBag(scope), targetFor(target), applyGenericProperty(target, property, value, mode), variablePasses
- createScriptRunner(): ScriptRunner { step(scene,state,input,hooks,dt), runUI(element, "tap"|"hold"|"release") } — hooks: { shake(intensity,duration), restart() }. Mensajes: broadcast emite y onMessage consume.
- Un script de UI usa los mismos bloques; dentro de él self es el propio elemento de interfaz, así que los bloques de tamaño, posición, opacidad, visibilidad y color (setSize, setX, setY, setOpacity, setVisible, setColor, setBg) actúan sobre el elemento, y los de puntuación, vidas, escena, sonido o entidades siguen actuando sobre la partida.
- "wait" usa value en ms: detiene ese script en ese punto (también dentro de repeat/if/ifVariable) y lo reanuda después con los bloques siguientes, sin reiniciarlo. Un wait sin value (0 ms) no hace nada.
- "setObjectSize" cambia el tamaño de un objeto concreto sin depender de dónde vive el script: usa text = "self" (el propio objeto) o un EntityKind (player|platform|enemy|coin|goal|decor), w/h con el nuevo ancho/alto (>=4 px) y bool = false para el primer objeto de ese tipo o true para todos. Para cambiar solo ancho o solo alto, deja el otro en 0/undefined.

UI OVERLAY
- UIElement { id, kind: "button"|"label"|"image"|"panel"|"bar"|"joystick", name, x,y,w,h, anchor, text, fontSize, color, bg, border, radius, opacity, image, action: "none"|"left"|"right"|"jump"|"restart"|"exit"|"event", eventName, bind: "none"|"score"|"lives"|"time", max, visible, scripts?: Script[] (eventos onTap|onHold|onRelease) }
- resolveUIRect(el, screenW, screenH), newUIElement(kind)

PERSISTENCIA
- loadProject, loadProjectById, saveProject, saveProjectById, getCurrentProjectId, schedulePushToCloud, cloud-sync.

REGLAS PARA LA IA
- Cuando generes scripts, usa solo EventType/BlockKind/properties reales de arriba. No inventes APIs.
- Para scripts que involucren capas, usa layerId y el mapeo depth↔z (≤5 delante, >5 detrás) y explica al usuario el slider 1-10.
- Distingue editor visual (capas, inspector), lógica de juego (scripts, física) y capa social (publicar, moderación).
- Si algo no existe en el motor, dilo y sugiere alternativa con bloques reales.
`.trim();

export const ENGINE_MODULE_SUMMARY = {
  core: "Motor principal: tipos de entidades, escenas, física, renderizado, bucle del juego, API de creación y jerarquía padre/hijo (parentId, movimiento heredado). Incluye mapeo de profundidad de capas 1-10 (≤5 delante, >5 detrás).",
  scripts: "Scripting: 14 eventos y 51 bloques visuales (incluye setVariable/broadcast/ifVariable/repeat/setProperty/changeProperty/setObjectSize).",
  storage: "Persistencia: guardado/carga de proyectos en almacenamiento local y nube.",
  animations: "Clips de animación: estados, sprites y reproducción frame a frame.",
  sfx: "Efectos de sonido: reproducción de archivos de audio personalizados del usuario (sin preajustes).",
  images: "Utilidades de imagen: generación y procesado de sprites.",
  cloudSync: "Sincronización con la nube: subir/descargar proyectos entre dispositivos.",
};
