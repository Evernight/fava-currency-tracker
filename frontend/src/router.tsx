import { createHashRouter } from "react-router";
import { Dashboard } from "./components/Dashboard";

export const router = createHashRouter([
  {
    path: "/",
    element: <Dashboard />,
  },
]);


