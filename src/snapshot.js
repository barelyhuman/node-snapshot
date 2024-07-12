import { diffTrimmedLines } from "diff";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative } from "node:path";
import { format } from "pretty-format";
import k from "kleur";

const ADDED = k.green;
const REMOVED = k.red;

function getFileName() {
  const err = new Error();
  const stackArr = err.stack.split("\n");
  let matched;
  stackArr.forEach((l, i) => {
    if (l.toLowerCase() === "error") {
      return false;
    }

    if (l.includes("snapshot")) {
      matched = stackArr[i + 1].match(/\((.+)\)$/);
    }
  });
  if (!matched) {
    return;
  }
  const filePath = matched[1];
  const pathSplits = filePath.split(":");
  let lineNumber, col;
  pathSplits.reverse().forEach((i, ind) => {
    if (ind === 0 && !isNaN(+i)) {
      col = i;
    }
    if (ind === 1 && !isNaN(+i)) {
      lineNumber = i;
    }
  });

  const sanitizedFilePath = filePath
    .replace(`:${lineNumber}:${col}`, "")
    .replace("file://", "");

  return {
    filename: sanitizedFilePath,
    line: lineNumber,
    col: col,
  };
}

const require = createRequire(import.meta.url);

export function snapsnot(
  test,
  currentValue,
  errorMsg = "Snapshot does not match"
) {
  const hasFileDetails = getFileName();
  const shouldUpdate = () => Number(process.env.UPDATE_SNAPSHOTS) === 1;
  if (!hasFileDetails) return;
  const { filename } = hasFileDetails;
  const snapshotFileName = join(
    "snapshots",
    relative(process.cwd(), filename.replace(extname(filename), ".snap.cjs"))
  );
  let snapshotName = test.name;
  if (test.fullName) {
    snapshotName = test.fullName;
  } else if (test.name) {
    snapshotName = test.name;
  }

  if (shouldUpdate()) {
    process.nextTick(() =>
      writeSnapshot(currentValue, snapshotFileName, snapshotName)
    );
    return;
  }

  if (existsSync(snapshotFileName)) {
    const module = require("./" + snapshotFileName);
    if (module[snapshotName]) {
      const _diff = diffTrimmedLines(
        format(currentValue),
        module[snapshotName]
      );
      const hasChanges = _diff.filter((d) => d.added || d.removed);
      if (hasChanges.length) {
        let changeText = k.reset("\n");
        _diff.forEach((d) => {
          if (d.added) {
            changeText += `${ADDED("expected")} ${d.value}`.trimEnd() + "\n";
          } else if (d.removed) {
            changeText += `${REMOVED("received")} ${d.value}`.trimEnd() + "\n";
          } else {
            changeText += d.value.trimEnd() + "\n";
          }
        });

        test.diagnostic(changeText);
        throw new Error(errorMsg);
      }
    } else {
      throw new Error(
        `Snapshot doesn't exist for \`${snapshotName}\`, please run the test command with UPDATE_SNAPSHOTS=1`
      );
    }
  }
  process.nextTick(() =>
    writeSnapshot(currentValue, snapshotFileName, snapshotName)
  );
}

function writeSnapshot(value, file, name) {
  if (!existsSync(file)) {
    let data = (file, "utf8");
    data += "\n\n";
    data += `exports[\`${name}\`]=\`${format(value)}\``;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, data, "utf8");
    return;
  }
  const module = require("./" + file);
  module[name] = format(value);
  let newContent = "";
  Object.keys(module).forEach((exp) => {
    newContent += `exports[\`${exp}\`]=\`${module[exp]}\`\n\n`;
  });
  writeFileSync(file, newContent, "utf8");
}
