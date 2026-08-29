import { useLocation, useOutlet } from "react-router-dom";

export default function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <div key={location.pathname} className="page-enter h-full min-h-0">
      {outlet}
    </div>
  );
}
