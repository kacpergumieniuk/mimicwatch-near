// The engine's own tests read paths relative to the engine folder (they were written for its own repo).
process.chdir(new URL("../engine", import.meta.url).pathname);
