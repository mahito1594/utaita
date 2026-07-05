/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import App from "./app/App.tsx";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root element not found in index.html");
}

render(() => <App />, root);
