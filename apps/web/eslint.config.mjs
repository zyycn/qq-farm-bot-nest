import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    typescript: true,
    unocss: true,
    formatters: true
  },
  {
    rules: {
      'style/arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
      'style/object-curly-spacing': ['error', 'always'],
      'style/linebreak-style': ['error', 'unix'],
      'style/comma-dangle': ['error', 'never'],
      'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],

      'vue/comma-dangle': ['error', 'never'],

      'e18e/ban-dependencies': ['error', {
        allowed: ['axios']
      }],
      'e18e/prefer-static-regex': 'off'
    }
  }
)
