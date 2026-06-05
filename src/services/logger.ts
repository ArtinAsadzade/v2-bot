export const logger = {
  info: (msg: string) => console.log("[INFO]", msg),
  error: (msg: string) => console.error("[ERROR]", msg),
  debug: (msg: string) => console.log("[DEBUG]", msg),
};
