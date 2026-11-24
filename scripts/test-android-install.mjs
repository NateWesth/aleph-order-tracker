import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const require = createRequire(import.meta.url);
const workflow = parse(readFileSync(new URL("../.github/workflows/build-android.yml", import.meta.url), "utf8"));
const step = workflow.jobs.build.steps.find(step => step.name === "Install dependencies");

test("Android skips only ONNX's external binary download, retaining npm ci and other install scripts", () => {
  assert.equal(step?.env?.ONNXRUNTIME_NODE_INSTALL, "skip");
  assert.equal(step.run, "npm ci");
  assert.equal(step.env.npm_config_ignore_scripts, undefined);
});

test("The installed ONNX installer exits successfully without any HTTPS download in Android", () => {
  const installer = join(dirname(require.resolve("onnxruntime-node/package.json")), "script/install.js");
  const result = spawnSync(process.execPath, ["-e", `
    require('https').request = require('https').get = () => { throw new Error('Unexpected binary download'); };
    require(${JSON.stringify(installer)});
  `], { env: { ...process.env, ONNXRUNTIME_NODE_INSTALL: step.env.ONNXRUNTIME_NODE_INSTALL }, encoding: "utf8", timeout: 15000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});