const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execSync } = require("node:child_process");

function getInput(name, fallback = "") {
  const key = `INPUT_${name.toUpperCase()}`;
  return (process.env[key] || fallback).trim();
}

function run(cmd, cwd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function globToRegExp(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function loadPnpmWorkspacePatterns(rootDir) {
  const file = path.join(rootDir, "pnpm-workspace.yaml");
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const out = [];
  let inPackages = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "packages:" || line.startsWith("packages:")) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const match = line.match(/^\-\s*["']?(.+?)["']?$/);
    if (!match) {
      if (!line.startsWith("-")) break;
      continue;
    }
    out.push(match[1]);
  }
  return out;
}

function collectPackageJsonFiles(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name === "package.json") {
        results.push(full);
      }
    }
  }
  return results;
}

function collectWorkspacePatterns(rootDir, rootPkg) {
  const patterns = [];
  if (Array.isArray(rootPkg.workspaces)) patterns.push(...rootPkg.workspaces);
  if (isObject(rootPkg.workspaces) && Array.isArray(rootPkg.workspaces.packages)) {
    patterns.push(...rootPkg.workspaces.packages);
  }
  if (Array.isArray(rootPkg.packages)) patterns.push(...rootPkg.packages);
  patterns.push(...loadPnpmWorkspacePatterns(rootDir));
  return [...new Set(patterns)];
}

function findPackages(rootDir) {
  const rootPackageJson = path.join(rootDir, "package.json");
  if (!fs.existsSync(rootPackageJson)) {
    throw new Error(`No package.json found in ${rootDir}`);
  }

  const rootPkg = readJson(rootPackageJson);
  const patterns = collectWorkspacePatterns(rootDir, rootPkg);
  const packageFiles = collectPackageJsonFiles(rootDir);

  const selected = [];
  const regexes = patterns.map(globToRegExp);
  for (const file of packageFiles) {
    const packageDir = path.dirname(file);
    const relDir = path.relative(rootDir, packageDir).replace(/\\/g, "/");

    const isRoot = relDir === "";
    const inWorkspace = regexes.some((r) => r.test(relDir));

    if (isRoot || inWorkspace) {
      selected.push({ packageDir, relDir, packageJsonPath: file, pkg: readJson(file) });
    }
  }

  return selected;
}

/**
 * Normalizes filenames that contain build-time content hashes so that the same
 * logical file can be matched across builds even when the hash changes.
 *
 * Detected as a hash: a separator-delimited segment of 8–20 alphanumeric chars
 * that is either pure-hex, contains both letters and digits, or has mixed case
 * (covers webpack hex hashes, Vite base64url hashes, Rollup, CRA, Next.js, …).
 *
 * Examples:
 *   dist/index.abc12345.js      → dist/index.[hash].js
 *   assets/index-DiwrgTda.js    → assets/index-[hash].js
 *   dist/main.a1b2c3d4.chunk.js → dist/main.[hash].chunk.js
 */
function normalizeHashedFilename(filename) {
  return filename
    .split("/")
    .map((segment) =>
      segment.replace(/([.-])([a-zA-Z0-9]{8,20})(?=[.-]|$)/g, (match, sep, hash) => {
        const isPureHex = /^[0-9a-f]+$/i.test(hash);
        const hasBothLetterAndDigit = /[a-zA-Z]/.test(hash) && /[0-9]/.test(hash);
        const hasMixedCase = /[a-z]/.test(hash) && /[A-Z]/.test(hash);
        return isPureHex || hasBothLetterAndDigit || hasMixedCase ? `${sep}[hash]` : match;
      }),
    )
    .join("/");
}

function collectExportFiles(node, exportPath, out) {
  if (typeof node === "string") {
    if (node.startsWith("./")) out.push({ exportPath, file: node.slice(2) });
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectExportFiles(item, exportPath, out);
    return;
  }
  if (!isObject(node)) return;
  for (const value of Object.values(node)) {
    collectExportFiles(value, exportPath, out);
  }
}

function parseExports(exportsField) {
  if (!exportsField) return [];
  const out = [];

  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    collectExportFiles(exportsField, ".", out);
  } else if (isObject(exportsField)) {
    const keys = Object.keys(exportsField);
    const explicitExportKeys = keys.filter((k) => k === "." || k.startsWith("./"));

    if (explicitExportKeys.length > 0) {
      for (const key of explicitExportKeys) {
        collectExportFiles(exportsField[key], key, out);
      }
    } else {
      collectExportFiles(exportsField, ".", out);
    }
  }

  const uniq = new Map();
  for (const item of out) uniq.set(`${item.exportPath}::${item.file}`, item);
  return [...uniq.values()];
}

function detectPackageManager(dir) {
  if (
    fs.existsSync(path.join(dir, "pnpm-lock.yaml")) ||
    fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))
  ) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(dir, "yarn.lock"))) {
    return "yarn";
  }
  if (fs.existsSync(path.join(dir, "bun.lockb"))) {
    return "bun";
  }
  return "npm";
}

function defaultInstallCommand(pm) {
  if (pm === "pnpm") return "pnpm install";
  if (pm === "yarn") return "yarn install";
  if (pm === "bun") return "bun install";
  return "npm ci";
}

function defaultBuildCommand(pm) {
  if (pm === "pnpm") return "pnpm run build";
  if (pm === "yarn") return "yarn build";
  if (pm === "bun") return "bun run build";
  return "npm run build --if-present";
}

/**
 * For packages that don't use the modern `exports` field, fall back to the
 * legacy `main` and/or `module` fields and treat them as the "." export.
 */
function parseMainModuleFiles(pkg) {
  const out = [];
  const seen = new Set();

  const addFile = (field) => {
    if (!field || typeof field !== "string") return;
    const file = field.startsWith("./") ? field.slice(2) : field;
    if (!seen.has(file)) {
      seen.add(file);
      out.push({ exportPath: ".", file });
    }
  };

  addFile(pkg.main);
  addFile(pkg.module);
  return out;
}

function resolveBuildCommand(workingDir, defaultBuild) {
  const script = path.join(workingDir, ".boris-build.sh");
  if (fs.existsSync(script)) {
    fs.chmodSync(script, 0o755);
    return `bash ${JSON.stringify(script)}`;
  }
  return defaultBuild;
}

/** Measure raw, gzip, and brotli sizes for a single output file. */
function measureFileSizes(filePath) {
  if (!fs.existsSync(filePath)) {
    return { rawSize: 0, gzipSize: 0, brotliSize: 0 };
  }
  const content = fs.readFileSync(filePath);
  const rawSize = content.length;
  const gzipSize = zlib.gzipSync(content, { level: 9 }).length;
  const brotliSize = zlib.brotliCompressSync(content, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;
  return { rawSize, gzipSize, brotliSize };
}

function collectSnapshot(rootDir) {
  const packages = [];
  for (const entry of findPackages(rootDir)) {
    let exportsList = parseExports(entry.pkg.exports).filter(
      (e) => e.file.endsWith(".js") || e.file.endsWith(".mjs") || e.file.endsWith(".cjs"),
    );
    if (!exportsList.length) exportsList = parseMainModuleFiles(entry.pkg);
    if (!exportsList.length) continue;

    const exportGroups = new Map();
    for (const exp of exportsList) {
      const filePath = path.join(entry.packageDir, exp.file);
      const sizes = measureFileSizes(filePath);
      if (sizes.rawSize === 0 && !fs.existsSync(filePath)) {
        console.warn(
          `::warning::Missing output file for ${entry.pkg.name || entry.relDir || "."}: ${exp.file}`,
        );
      }

      if (!exportGroups.has(exp.exportPath)) exportGroups.set(exp.exportPath, []);
      exportGroups.get(exp.exportPath).push({ file: exp.file, ...sizes });
    }

    packages.push({
      name: entry.pkg.name || path.basename(entry.packageDir),
      path: entry.relDir || undefined,
      exports: [...exportGroups.entries()].map(([exportPath, files]) => ({ exportPath, files })),
    });
  }

  return packages;
}

function flattenByPackage(snapshot, isMain) {
  const map = new Map();
  for (const pkg of snapshot) {
    for (const exp of pkg.exports) {
      for (const file of exp.files) {
        const normalizedFile = normalizeHashedFilename(file.file);
        const key = [pkg.name, pkg.path || "", exp.exportPath, normalizedFile].join("::");
        const existing = map.get(key) || {
          packageName: pkg.name,
          packagePath: pkg.path,
          exportPath: exp.exportPath,
          file: normalizedFile,
          mainSize: 0,
          prSize: 0,
          gzipMainSize: 0,
          gzipPrSize: 0,
          brotliMainSize: 0,
          brotliPrSize: 0,
        };
        if (isMain) {
          existing.mainSize = file.rawSize;
          existing.gzipMainSize = file.gzipSize;
          existing.brotliMainSize = file.brotliSize;
        } else {
          existing.prSize = file.rawSize;
          existing.gzipPrSize = file.gzipSize;
          existing.brotliPrSize = file.brotliSize;
        }
        map.set(key, existing);
      }
    }
  }
  return map;
}

function mergeSnapshots(mainSnapshot, prSnapshot) {
  const mainMap = flattenByPackage(mainSnapshot, true);
  const prMap = flattenByPackage(prSnapshot, false);

  const merged = new Map(mainMap);
  for (const [key, value] of prMap.entries()) {
    const existing = merged.get(key);
    if (existing) {
      existing.prSize = value.prSize;
      existing.gzipPrSize = value.gzipPrSize;
      existing.brotliPrSize = value.brotliPrSize;
    } else {
      merged.set(key, value);
    }
  }

  const packageMap = new Map();
  for (const value of merged.values()) {
    const pkgKey = `${value.packageName}::${value.packagePath || ""}`;
    if (!packageMap.has(pkgKey)) {
      packageMap.set(pkgKey, {
        name: value.packageName,
        path: value.packagePath,
        exports: new Map(),
      });
    }
    const pkg = packageMap.get(pkgKey);
    if (!pkg.exports.has(value.exportPath)) pkg.exports.set(value.exportPath, []);
    pkg.exports.get(value.exportPath).push({
      file: value.file,
      mainSize: value.mainSize,
      prSize: value.prSize,
      gzipMainSize: value.gzipMainSize,
      gzipPrSize: value.gzipPrSize,
      brotliMainSize: value.brotliMainSize,
      brotliPrSize: value.brotliPrSize,
    });
  }

  return [...packageMap.values()].map((pkg) => ({
    name: pkg.name,
    ...(pkg.path ? { path: pkg.path } : {}),
    exports: [...pkg.exports.entries()].map(([exportPath, files]) => ({ exportPath, files })),
  }));
}

function setOutput(name, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  fs.appendFileSync(out, `${name}=${value}\n`);
}

async function main() {
  const apiKey = getInput("api-key");
  const apiUrl = "https://boris-api.resynapse.dev";
  const baseBranchInput = getInput("base-branch", "main");
  const workingDirectory = path.resolve(getInput("working-directory", "."));
  const pm = detectPackageManager(workingDirectory);
  console.log(`Detected package manager: ${pm}`);
  const installCommand = getInput("install-command") || defaultInstallCommand(pm);
  const buildCommand = resolveBuildCommand(
    workingDirectory,
    getInput("build-command") || defaultBuildCommand(pm),
  );

  if (!apiKey) throw new Error("Missing required input: api-key");

  const eventName = process.env.GITHUB_EVENT_NAME;
  if (eventName !== "pull_request") {
    throw new Error(
      `This action only supports pull_request events (received: ${eventName || "unknown"})`,
    );
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    throw new Error("GITHUB_EVENT_PATH is not available");
  }
  const event = readJson(eventPath);
  const pr = event.pull_request;
  if (!pr) throw new Error("pull_request payload is missing");

  const repository = process.env.GITHUB_REPOSITORY;
  const prNumber = pr.number;
  const prTitle = pr.title;
  const branch = pr.head?.ref;
  const commitSha = pr.head?.sha;
  const prMerged = Boolean(pr.merged);
  const prState = pr.state === "closed" ? "closed" : "open";
  const baseBranch = pr.base?.ref || baseBranchInput;

  if (!repository || !prNumber || !branch || !commitSha) {
    throw new Error("Missing required GitHub metadata");
  }

  const endpoint = `${apiUrl.replace(/\/$/, "")}/api/report`;

  // For closed PR events, avoid re-measuring files (which can overwrite
  // historical diffs once the base branch includes the merged changes).
  // Just update merge/state metadata on the existing evolution rows.
  if (prState === "closed") {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ repository, prNumber, prMerged, prState }),
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`Boris API request failed (${response.status}): ${bodyText}`);
    }

    setOutput("records-created", 0);
    console.log(`Updated PR status in Boris for #${prNumber} (${prState}).`);
    return;
  }

  run(installCommand, workingDirectory);
  run(buildCommand, workingDirectory);
  const prSnapshot = collectSnapshot(workingDirectory);

  const startingSha = execSync("git rev-parse HEAD", {
    cwd: workingDirectory,
    encoding: "utf8",
  }).trim();

  try {
    run(`git fetch --no-tags origin ${baseBranch}`, workingDirectory);
    run(`git checkout --force origin/${baseBranch}`, workingDirectory);

    run(installCommand, workingDirectory);
    run(buildCommand, workingDirectory);
  } finally {
    run(`git checkout --force ${startingSha}`, workingDirectory);
  }

  const mainSnapshot = collectSnapshot(workingDirectory);
  const payload = {
    repository,
    prNumber,
    prTitle,
    branch,
    commitSha,
    prMerged,
    prState,
    packages: mergeSnapshots(mainSnapshot, prSnapshot),
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Boris API request failed (${response.status}): ${bodyText}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = { success: true };
  }

  const records = Number(parsed.recordsCreated || 0);
  setOutput("records-created", records);
  console.log(`Reported bundle sizes to Boris (${records} records).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
