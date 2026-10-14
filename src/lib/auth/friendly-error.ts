/** Convierte respuestas técnicas de acceso en mensajes útiles para la persona usuaria. */
export function friendlyAuthError(message: string): string {
  const normalized = message.trim().toLowerCase();

  if (/rate limit|rate_limit|over.?request.?rate|too many (requests|attempts)|email.*send/i.test(normalized)) {
    return "Límite de envíos de correo alcanzado. Espera un momento antes de volver a intentarlo.";
  }

  if (/load failed|failed to fetch|network request failed|invalid login credentials|invalid credentials|incorrect (email|password)|password.*does not match/i.test(normalized)) {
    return "Usuario o contraseña incorrectos. Revísalos e inténtalo de nuevo.";
  }

  if (/user already registered|already registered|email.*already.*exist/i.test(normalized)) {
    return "Ese email ya tiene una cuenta. Pulsa ACCEDER para entrar.";
  }

  if (/email not confirmed|confirm your email|verify your email/i.test(normalized)) {
    return "Aún no has confirmado tu email. Revisa tu bandeja de entrada y la carpeta de spam.";
  }

  return message;
}
