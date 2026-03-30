import { Route, Routes } from "react-router-dom";

import DevUIGallery from "./pages/DevUIGallery";
import Home from "./pages/Home";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dev/ui" element={<DevUIGallery />} />
    </Routes>
  );
}
