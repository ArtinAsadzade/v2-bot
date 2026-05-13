module.exports = {
  root: true,
  extends: ['./packages/configs/eslint/base.cjs'],
  ignorePatterns: ['dist', '.next', 'node_modules', 'coverage', 'apps/api/prisma/generated']
};
