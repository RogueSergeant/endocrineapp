module.exports = {
  preset: "jest-expo",
  testMatch: ["**/?(*.)+(test).[jt]s?(x)"],
  transformIgnorePatterns: [
    "node_modules/(?!(expo|@expo|react-native|@react-native|@react-navigation|@react-native-firebase|@react-native-ml-kit|react-native-vision-camera)/)",
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};
