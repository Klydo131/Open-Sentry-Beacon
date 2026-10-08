import parser from '@typescript-eslint/parser';
import hooks from 'eslint-plugin-react-hooks';
export default [
  { ignores: ['node_modules/**', '.next/**', 'public/**', 'docs/screenshots/**'] },
  { files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': hooks },
    rules: { 'no-unreachable': 'error', 'no-dupe-args': 'error',
      'no-constant-binary-expression': 'error', 'valid-typeof': 'error',
      'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
];
