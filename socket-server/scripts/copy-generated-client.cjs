const { cpSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const source = join(__dirname, "..", "src", "generated", "prisma");
const destination = join(__dirname, "..", "dist", "generated", "prisma");

mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
