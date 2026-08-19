import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const maxGzipKiB = Number(process.env.WORKER_GZIP_BUDGET_KIB ?? "2800");
const outDir = mkdtempSync(join(tmpdir(), "ss-reading-worker-bundle-"));
const wrangler = process.platform === "win32" ? "wrangler.cmd" : "wrangler";

try {
  const result = spawnSync(wrangler, ["deploy", "--dry-run", "--outdir", outDir], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" }
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Wrangler dry-run failed with exit code ${result.status}.`);
  }

  const match = output.match(/gzip:\s*([\d.]+)\s*(MiB|KiB|B)/i);
  if (!match) throw new Error("Wrangler output did not report a gzip bundle size.");

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const gzipKiB = unit === "mib" ? value * 1024 : unit === "kib" ? value : value / 1024;

  if (gzipKiB > maxGzipKiB) {
    throw new Error(
      `Worker gzip bundle is ${gzipKiB.toFixed(2)} KiB; budget is ${maxGzipKiB.toFixed(2)} KiB.`
    );
  }

  console.log(
    `[worker-size] ${gzipKiB.toFixed(2)} KiB gzip; ${(
      maxGzipKiB - gzipKiB
    ).toFixed(2)} KiB remains inside the deployment budget.`
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
