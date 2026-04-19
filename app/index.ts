import { registerRootComponent } from "expo";
import App from "./src/App";

// registerRootComponent calls AppRegistry.registerComponent("main", () => App)
// and also handles the Expo Go / dev-client wrapping. Release APKs won't
// launch without this.
registerRootComponent(App);
