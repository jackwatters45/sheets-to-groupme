export const logger = {
  info: (_message: string): void => {
    console.log(`[INFO] ${_message}`);
  },
  error: (_message: string): void => {
    console.error(`[ERROR] ${_message}`);
  },
  debug: (_message: string): void => {
    if (process.env.LOG_LEVEL === "debug") {
      console.log(`[DEBUG] ${_message}`);
    }
  },
};
