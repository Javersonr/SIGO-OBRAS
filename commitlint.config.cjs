/**
 * commitlint config — valida Conventional Commits 1.0.0
 * https://www.conventionalcommits.org/
 *
 * Roda automaticamente no commit-msg hook do Husky (.husky/commit-msg).
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "perf",
        "test",
        "build",
        "ci",
        "chore",
        "revert",
      ],
    ],
    "subject-case": [0], // permite qualquer case no subject (PT-BR + emojis ok)
    "subject-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 200],
    "footer-max-line-length": [2, "always", 200],
    "header-max-length": [2, "always", 120],
    "scope-empty": [0], // escopo opcional
    "scope-case": [0], // permite kebab e camel
  },
  // mensagens em PT-BR
  helpUrl:
    "https://github.com/Javersonr/SIGO-OBRAS/blob/master/CONTRIBUTING.md#conventional-commits-obrigatório",
};
