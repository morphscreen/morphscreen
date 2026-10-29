import HtmlWebpackPlugin from "html-webpack-plugin";

export default {
  entry: "./src/main.js",
  output: { clean: true },
  module: {
    rules: [
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
      // The core is served as a file of its own, and loadCore fetches it.
      { test: /\.wasm$/, type: "asset/resource" },
    ],
  },
  plugins: [new HtmlWebpackPlugin({ title: "MorphScreen with webpack", templateContent: '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body><div id="answer"></div></body></html>' })],
};
