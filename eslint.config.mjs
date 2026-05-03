import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import reactCompiler from "eslint-plugin-react-compiler";

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    plugins: { "react-compiler": reactCompiler },
    rules: { "react-compiler/react-compiler": "error" },
  },
  {
    ignores: ["_legacy/**", ".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
