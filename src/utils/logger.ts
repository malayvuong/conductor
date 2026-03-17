const timestamp = (): string => new Date().toISOString();

export const log = {
  info: (msg: string) => console.log(`[${timestamp()}] ${msg}`),
  error: (msg: string) => console.error(`[${timestamp()}] ERROR: ${msg}`),
  debug: (msg: string) => {
    if (process.env.DEBUG) console.log(`[${timestamp()}] DEBUG: ${msg}`);
  },
};
