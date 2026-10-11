// assets/ の画像を js/assets.js に data URL として埋め込むスクリプト。
// index.html をダブルクリック（file://）で開いても canvas が汚染されず、
// PNG 書き出しができるようにするため。画像を差し替えたら実行する。
//
//   node tools/embed-assets.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const toDataUrl = (rel) => {
  const buf = readFileSync(join(root, rel));
  return `data:${mime[extname(rel).toLowerCase()]};base64,${buf.toString("base64")}`;
};

const assets = {
  logoIcon: toDataUrl("assets/logo-icon-white.png"),
  samples: {
    soma: toDataUrl("assets/samples/soma.jpg"),
    henohenon: toDataUrl("assets/samples/henohenon.png"),
  },
};

writeFileSync(
  join(root, "js/assets.js"),
  "// 自動生成: node tools/embed-assets.mjs\nwindow.THUMB_ASSETS = " + JSON.stringify(assets) + ";\n"
);
console.log("wrote js/assets.js");
