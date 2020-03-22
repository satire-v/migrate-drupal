module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "airbnb",
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "prettier/@typescript-eslint",
  ],
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly",
    module: true,
    global: true,
  },
  parserOptions: { ecmaVersion: "2019", sourceType: "module" },
  plugins: ["@typescript-eslint", "import", "prettier"],
  parser: "@typescript-eslint/parser",
  settings: {
    "import/extensions": [".ts"],
    "import/parsers": {
      "@typescript-eslint/parser": [".ts"],
    },
    "import/resolver": {
      node: {
        extensions: [".js", ".ts"],
      },
    },
  },
  rules: {
    "no-unused-vars": 1,
    "no-console": 1,
    "import/order": [
      "warn",
      {
        "newlines-between": "always",
        alphabetize: { order: "desc", caseInsensitive: true },
      },
    ],
    "@typescript-eslint/no-empty-function": "off",
    "import/no-named-as-default-member": "off",
    "import/no-unresolved": ["error", { commonjs: true }],
    "import/extensions": "off",
    "import/no-named-as-default": "off",
    "max-classes-per-file": 0,
  },
};
