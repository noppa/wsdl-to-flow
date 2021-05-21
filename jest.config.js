module.exports = {
  verbose: true,
  watchPathIgnorePatterns: [
    '/cache/',
    '/flow-sandbox/',
    '/node_modules/'
  ],
  testMatch: [
    '<rootDir>/test/**/*.test.ts',
  ]
}
