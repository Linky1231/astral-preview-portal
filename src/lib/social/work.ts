// ───── Chats de trabajo: tareas, archivos e hilos ─────
// Funcionalidad guardada en este dispositivo (localStorage, mismo prefijo que
// el adaptador local del resto de la app) para los "chats de trabajo":
// gestor de tareas asignables por el administrador/moderadores, gestor de
// archivos de cualquier extensión e hilos de conversación. Todo queda
// guardado por chat y persiste entre sesiones.

export type WorkTask = {
  id: string;
  chat_id: string;
  title: string;
  description: string;
  status: "todo" | "doing" | "done";
  assignee_id: string | null;
  assignee_name: string;
  project_id: string | null;
  project_name: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

export type WorkProject = {
  id: string;
  chat_id: string; // chat de trabajo donde se creó el proyecto
  channel_id: string; // canal de chat de trabajo asociado
  channel_name: string;
  name: string;
  description: string;
  status: "planning" | "active" | "done";
  representative_id: string | null;
  representative_name: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

export type WorkFile = {
  id: string;
  chat_id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string; // base64 persistente en localStorage
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
};

export type WorkThread = {
  id: string;
  chat_id: string;
  title: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
};

export type ThreadMessage = {
  id: string;
  thread_id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

function rows<T>(table: string): T[] {
  try {
    const raw = localStorage.getItem(`_local_data_${table}`);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function save(table: string, list: unknown[]): void {
  try {
    localStorage.setItem(`_local_data_${table}`, JSON.stringify(list));
  } catch {
    /* sin espacio (modo local): se ignora */
  }
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Marcador de chat de trabajo ───

export function listWorkChats(): string[] {
  return rows<string>("work_chats");
}

export function isWorkChat(chatId: string): boolean {
  return listWorkChats().includes(chatId);
}

export function markWorkChat(chatId: string, on: boolean): void {
  const list = listWorkChats();
  save("work_chats", on ? Array.from(new Set([...list, chatId])) : list.filter((id) => id !== chatId));
}

// ─── Tareas ───

export function listTasks(chatId: string): WorkTask[] {
  return rows<WorkTask>("work_tasks")
    .filter((t) => t.chat_id === chatId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function createTask(input: {
  chat_id: string;
  title: string;
  description: string;
  assignee_id: string | null;
  assignee_name: string;
  project_id?: string | null;
  project_name?: string;
  created_by: string;
  created_by_name: string;
}): WorkTask {
  const task: WorkTask = {
    id: uid(),
    chat_id: input.chat_id,
    title: input.title.trim(),
    description: input.description.trim(),
    status: "todo",
    assignee_id: input.assignee_id,
    assignee_name: input.assignee_name,
    project_id: input.project_id ?? null,
    project_name: input.project_name ?? "",
    created_by: input.created_by,
    created_by_name: input.created_by_name,
    created_at: new Date().toISOString(),
  };
  save("work_tasks", [...rows<WorkTask>("work_tasks"), task]);
  return task;
}

export function setTaskStatus(id: string, status: WorkTask["status"]): void {
  save(
    "work_tasks",
    rows<WorkTask>("work_tasks").map((t) => (t.id === id ? { ...t, status } : t))
  );
}

export function deleteTask(id: string): void {
  save("work_tasks", rows<WorkTask>("work_tasks").filter((t) => t.id !== id));
}

// ─── Proyectos del chat de trabajo ───
// Bandeja de proyectos del equipo: cada proyecto tiene un canal de chat de
// trabajo asociado, un representante y sus propias tareas.

export function listProjects(chatId: string): WorkProject[] {
  return rows<WorkProject>("work_projects")
    .filter((p) => p.chat_id === chatId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function listAllProjects(): WorkProject[] {
  return rows<WorkProject>("work_projects");
}

export function getProject(id: string): WorkProject | null {
  return rows<WorkProject>("work_projects").find((p) => p.id === id) ?? null;
}

export function createProject(input: {
  chat_id: string;
  channel_id: string;
  channel_name: string;
  name: string;
  description: string;
  representative_id: string | null;
  representative_name: string;
  created_by: string;
  created_by_name: string;
}): WorkProject {
  const project: WorkProject = {
    id: uid(),
    chat_id: input.chat_id,
    channel_id: input.channel_id,
    channel_name: input.channel_name,
    name: input.name.trim(),
    description: input.description.trim(),
    status: "planning",
    representative_id: input.representative_id,
    representative_name: input.representative_name,
    created_by: input.created_by,
    created_by_name: input.created_by_name,
    created_at: new Date().toISOString(),
  };
  save("work_projects", [...rows<WorkProject>("work_projects"), project]);
  return project;
}

export function updateProjectStatus(id: string, status: WorkProject["status"]): void {
  save(
    "work_projects",
    rows<WorkProject>("work_projects").map((p) => (p.id === id ? { ...p, status } : p))
  );
}

export function setProjectRepresentative(
  id: string,
  representativeId: string | null,
  representativeName: string
): void {
  save(
    "work_projects",
    rows<WorkProject>("work_projects").map((p) =>
      p.id === id ? { ...p, representative_id: representativeId, representative_name: representativeName } : p
    )
  );
}

export function deleteProject(id: string): void {
  save("work_projects", rows<WorkProject>("work_projects").filter((p) => p.id !== id));
  // Desvincula las tareas del proyecto eliminado.
  save(
    "work_tasks",
    rows<WorkTask>("work_tasks").map((t) =>
      t.project_id === id ? { ...t, project_id: null, project_name: "" } : t
    )
  );
}

// ─── Archivos (cualquier extensión, guardados en este dispositivo) ───

export function listFiles(chatId: string): WorkFile[] {
  return rows<WorkFile>("work_files")
    .filter((f) => f.chat_id === chatId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Todos los archivos de los chats de trabajo (para la búsqueda global). */
export function listAllWorkFiles(): WorkFile[] {
  return rows<WorkFile>("work_files").sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function addFile(input: {
  chat_id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  uploaded_by: string;
  uploaded_by_name: string;
}): WorkFile {
  const file: WorkFile = {
    id: uid(),
    chat_id: input.chat_id,
    name: input.name,
    mime: input.mime || "application/octet-stream",
    size: input.size,
    dataUrl: input.dataUrl,
    uploaded_by: input.uploaded_by,
    uploaded_by_name: input.uploaded_by_name,
    created_at: new Date().toISOString(),
  };
  save("work_files", [...rows<WorkFile>("work_files"), file]);
  return file;
}

export function deleteFile(id: string): void {
  save("work_files", rows<WorkFile>("work_files").filter((f) => f.id !== id));
}

// ─── Hilos de conversación ───

export function listThreads(chatId: string): WorkThread[] {
  return rows<WorkThread>("work_threads")
    .filter((t) => t.chat_id === chatId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Todos los hilos de los chats de trabajo (para la búsqueda global). */
export function listAllThreads(): WorkThread[] {
  return rows<WorkThread>("work_threads");
}

export function createThread(chatId: string, title: string, createdBy: string, createdByName: string): WorkThread {
  const thread: WorkThread = {
    id: uid(),
    chat_id: chatId,
    title: title.trim(),
    created_by: createdBy,
    created_by_name: createdByName,
    created_at: new Date().toISOString(),
  };
  save("work_threads", [...rows<WorkThread>("work_threads"), thread]);
  return thread;
}

export function deleteThread(id: string): void {
  save("work_threads", rows<WorkThread>("work_threads").filter((t) => t.id !== id));
  save("thread_messages", rows<ThreadMessage>("thread_messages").filter((m) => m.thread_id !== id));
}

export function listThreadMessages(threadId: string): ThreadMessage[] {
  return rows<ThreadMessage>("thread_messages")
    .filter((m) => m.thread_id === threadId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

/** Todos los mensajes de hilos (para la búsqueda global). */
export function listAllThreadMessages(): ThreadMessage[] {
  return rows<ThreadMessage>("thread_messages");
}

export function addThreadMessage(threadId: string, chatId: string, senderId: string, content: string): ThreadMessage {
  const msg: ThreadMessage = {
    id: uid(),
    thread_id: threadId,
    chat_id: chatId,
    sender_id: senderId,
    content: content.trim(),
    created_at: new Date().toISOString(),
  };
  save("thread_messages", [...rows<ThreadMessage>("thread_messages"), msg]);
  return msg;
}

// ─── Utilidades ───

export function formatBytes(n: number): string {
  if (!isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fileExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

const IMG_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv", "m4v"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "m4a", "aac", "flac"]);
const DOC_EXTS = new Set(["pdf", "doc", "docx", "txt", "md", "rtf", "odt"]);
const SHEET_EXTS = new Set(["xls", "xlsx", "csv", "ods"]);
const SLIDE_EXTS = new Set(["ppt", "pptx", "key", "odp"]);
const CODE_EXTS = new Set(["js", "ts", "tsx", "jsx", "py", "json", "html", "css", "sql", "sh", "yml", "yaml", "go", "rs", "java", "c", "cpp", "php", "rb"]);
const ARCHIVE_EXTS = new Set(["zip", "rar", "7z", "tar", "gz", "bz2"]);

export function fileKind(
  ext: string
): "image" | "video" | "audio" | "doc" | "sheet" | "slide" | "code" | "archive" | "other" {
  if (IMG_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (DOC_EXTS.has(ext)) return "doc";
  if (SHEET_EXTS.has(ext)) return "sheet";
  if (SLIDE_EXTS.has(ext)) return "slide";
  if (CODE_EXTS.has(ext)) return "code";
  if (ARCHIVE_EXTS.has(ext)) return "archive";
  return "other";
}

export function fileEmoji(ext: string): string {
  switch (fileKind(ext)) {
    case "image":
      return "🖼️";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "doc":
      return "📄";
    case "sheet":
      return "📊";
    case "slide":
      return "📽️";
    case "code":
      return "💻";
    case "archive":
      return "🗜️";
    default:
      return "📎";
  }
}
