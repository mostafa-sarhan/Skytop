/** Process state shared by the health endpoints and the shutdown handler. */
let shuttingDown = false;

export const markShuttingDown = (): void => {
  shuttingDown = true;
};

export const isShuttingDown = (): boolean => shuttingDown;
