/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-native",
          esModuleInterop: true,
          target: "ES2022",
          module: "CommonJS",
          moduleResolution: "Node",
          resolveJsonModule: true,
          strict: true,
          noUncheckedIndexedAccess: true,
          isolatedModules: true,
        },
      },
    ],
  },
};
